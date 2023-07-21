'use strict';

const fs = require('fs');
const path = require('path');
const ora = require('ora');
const os = require('os');
require('url');
const { sanitizeUrl } = require('./sanitizeUrl');

const docsPath = path.join(__dirname, 'graph-docs-samples');
const outputFile = 'graph-v1_0-proxy-mocks.json';

let totalFiles = 0;
let filesProcessed = 0;
let requestsDetected = 0;
let requestResponsePairsCreated = 0;
const spinner = ora('Generating mocks...').start();

// create log file name based on the current date and time
const now = new Date();
const logFileName = `${now.toISOString().replace(/[^\d\w]/g, '-')}.log`;

const LogLevel = Object.freeze({
  DEBUG: 0,
  INFO: 1,
  WARN: 2,
  ERROR: 3
});
const currentLogLevel = LogLevel.DEBUG;

/**
 * Updates the progress indicator
 */
function updateProgress() {
  spinner.text = `Generating mocks: ${filesProcessed}/${totalFiles} files processed, ${requestsDetected}/${requestResponsePairsCreated} requests detected/pairs created`;
}

function getLogLevelName(level) {
  return Object.keys(LogLevel)[level];
}

/**
 * Writes a message to the log file
 * @param {string} message Message to write to the log file
 * @param {string} fileOrRequest File name or request URL that the message is associated with
 * @returns {void}
 */
function writeToLog(message, level, fileOrRequest) {
  if (currentLogLevel > level) {
    return;
  }

  const now = new Date();
  let location = '';
  if (fileOrRequest) {
    if (fileOrRequest.startsWith('http')) {
      location = fileOrRequest;
    }
    else {
      location = path.relative(__dirname, fileOrRequest);
    }
  }
  fs.appendFileSync(logFileName, `${getLogLevelName(level)} ${now.toISOString()}\t${location}\t${message}${os.EOL}`);
}

/**
 * Gets all .md files in the graph-docs folder
 * @returns {Array<string>} Array of file paths to .md files with Graph docs
 */
function getAllMdFiles(docsPath) {
  const allFiles = [];
  const files = fs.readdirSync(docsPath);
  files.forEach(file => {
    if (file.endsWith('.md')) {
      allFiles.push(path.join(docsPath, file));
    }
  });

  totalFiles = allFiles.length;
  updateProgress();

  return allFiles;
}

/**
 * Parses request headers and body from an array of lines
 * @param {Array<string>} lines Array of lines that represent headers and body of a web request to Microsoft Graph
 * @returns {{headers: object, body: string}} Object containing headers and body
 */
function parseRequestHeadersAndBody(lines) {
  const headers = {};
  let body = '';

  let isBody = false;
  const bodyLines = [];

  lines.forEach(line => {
    if (isBody) {
      bodyLines.push(line);
      return;
    }

    if (line.trim() === '') {
      isBody = true;
      return;
    }

    const colonIndex = line.indexOf(':');
    const key = line.substr(0, colonIndex);
    const value = line.substr(colonIndex + 1).trim();
    headers[key] = value;
  });

  if (bodyLines.length > 0) {
    body = bodyLines.join('\n');
  }

  return { headers, body };
}

/**
 * Parses a request block from an array of lines
 * @param {Array<string>} lines Array of lines that represent a request block
 * @returns {{method: string, url: string, headers: object, body: string}} Object containing request method, url, and optionally headers and body
 */
function parseRequestBlock(lines) {
  // first line is method and url
  // next lines are headers (optional)
  // optional body is separated by empty line

  const request = {
    method: '',
    url: '',
    headers: {},
    body: ''
  };

  const methodAndUrl = lines[0];
  const firstSpaceIndex = methodAndUrl.indexOf(' ');
  request.method = methodAndUrl.substr(0, firstSpaceIndex);
  request.url = methodAndUrl.substr(firstSpaceIndex + 1);

  if (lines.length > 1) {
    const { headers, body } = parseRequestHeadersAndBody(lines.slice(1));
    request.headers = headers;
    request.body = body;
  }

  return request;
}

/**
 * Parses a response block from an array of lines
 * @param {Array<string>} lines Array of lines that represent a response block
 * @returns {{statusCode: number, headers: object, body: string}} Object containing response status code and optionally headers and body
 */
function parseResponseBlock(lines) {
  // first line is protocol, status code and text
  // next lines are headers
  // optional body is separated by empty line
  const response = {
    statusCode: 200,
    headers: {},
    body: ''
  };

  const protocolAndStatusCodeAndText = lines[0];
  const split = protocolAndStatusCodeAndText.split(' ');
  response.statusCode = parseInt(split[1]);

  // parse headers and body
  if (lines.length > 1) {
    const { headers, body } = parseRequestHeadersAndBody(lines.slice(1));
    response.headers = headers;
    response.body = body;
  }

  return response;
}

/**
 * Extracts request and response blocks from a .md file
 * @param {string} filePath Relative path to .md file
 * @returns {Array<{request: {method: string, url: string, headers: object, body: string}, response: {statusCode: number, headers: object, body: string}}>}
 */
function getRequestResponsePairs(filePath) {
  writeToLog(`Processing file ${filePath}`, LogLevel.DEBUG, filePath);

  filesProcessed++;
  updateProgress();

  const requestResponsePairs = [];

  try {
    const fileContents = fs.readFileSync(filePath, 'utf8');
    const lines = fileContents.split('\n');
    let inRequestBlock = false;
    let inResponseBlock = false;
    let inCodeBlock = false;
    let codeLines = [];

    let request;
    let response;

    lines.forEach(line => {
      if (line.indexOf('"blockType": "request"') > -1) {
        inRequestBlock = true;
        codeLines = [];
        return;
      }
      // ensure that we filter out responses that belong
      // to blockType: ignore
      if (line.indexOf('"blockType": "response"') > -1
        && request) {
        inResponseBlock = true;
        codeLines = [];
        return;
      }

      if (line.indexOf('```') === 0) {
        // code block is not in request or response block
        // ignore
        if (!inRequestBlock && !inResponseBlock) {
          return;
        }

        // start code block
        if (!inCodeBlock) {
          inCodeBlock = true;
          return;
        }
        // end code block
        if (inCodeBlock) {
          inCodeBlock = false;

          try {
            if (inRequestBlock) {
              requestsDetected++;
              writeToLog(`Parsing request from lines ${codeLines.join(os.EOL)}`, LogLevel.DEBUG, filePath);
              request = parseRequestBlock(codeLines);
              writeToLog(`Parsed request ${JSON.stringify(request, null, 2)}`, LogLevel.DEBUG, filePath);
              codeLines = [];
              inRequestBlock = false;
            }
            else if (inResponseBlock) {
              writeToLog(`Parsing response from lines ${codeLines.join(os.EOL)}`, LogLevel.DEBUG, filePath);
              response = parseResponseBlock(codeLines);
              writeToLog(`Parsed response ${JSON.stringify(response, null, 2)}`, LogLevel.DEBUG, filePath);
              requestResponsePairsCreated++;
              codeLines = [];
              requestResponsePairs.push({ request, response });
              request = undefined;
              response = undefined;
              inResponseBlock = false;
              updateProgress();
            }
          }
          catch (ex) {
            writeToLog(ex, LogLevel.ERROR, filePath);
          }
          return;
        }
      }

      if (inCodeBlock) {
        codeLines.push(line);
      }
    });
  }
  catch (ex) {
    writeToLog(ex, LogLevel.ERROR, filePath);
  }

  return requestResponsePairs;
}

/**
 * Replaces segments of a Microsoft Graph request URL that represent IDs with wildcards
 * @param {string} originalUrl Absolute URL of a Microsoft Graph request
 * @returns {string} Microsoft Graph request URL with wildcards for segments that represent IDs
 */
function generalizeRequestUrl(originalUrl) {
  let sanitizedUrl = sanitizeUrl(originalUrl);
  // replace {} and <> tokens with asterisks
  sanitizedUrl = sanitizedUrl.replace(/([{<][^>}]+[}>])/g, '*');
  writeToLog(`Generalized URL ${originalUrl} to ${sanitizedUrl}`, LogLevel.DEBUG);
  return sanitizedUrl;
}

/**
 * Converts a request/response pair to a proxy mock
 * @param {{request: {method: string, url: string, headers: object, body: string}, response: {statusCode: number, headers: object, body: string}}} requestResponse Request/response pair
 * @returns {{url: string, method: string, responseCode: number, responseHeaders: object, responseBody: object}} Proxy mock response
 */
function convertRequestResponseToProxyMock(requestResponse) {
  const { request, response } = requestResponse;
  const proxyMock = {
    url: request.url,
    method: request.method,
    responseCode: response.statusCode,
    responseHeaders: response.headers
  };
  if (response.body) {
    try {
      proxyMock.responseBody = JSON.parse(response.body);
    }
    catch (ex) {
      proxyMock.responseBody = response.body;
      writeToLog(ex, LogLevel.WARN, request.url);
    }
  }
  return proxyMock;
}

const allFiles = getAllMdFiles(docsPath);
const requestResponsePairs = allFiles
  .map(getRequestResponsePairs)
  .flat();
requestResponsePairs.forEach(pair => pair.request.url = generalizeRequestUrl(pair.request.url));
const proxyMocks = {
  responses: requestResponsePairs
    .map(convertRequestResponseToProxyMock)
    .filter(mock => mock !== undefined)
    // sort descending by URL length, so that the
    // most specific URLs are matched first
    .sort((a, b) => b.url.length - a.url.length)
};

const mocksCreated = proxyMocks.responses.length;

// dedupe proxy mocks by comparing URL and method
proxyMocks.responses = proxyMocks.responses.filter((mock, index) =>
  index === proxyMocks.responses.findIndex(m => m.url === mock.url && m.method === mock.method));

const mocksAfterDedupe = proxyMocks.responses.length;

updateProgress();

fs.writeFileSync(outputFile, JSON.stringify(proxyMocks, null, 2));

if (requestsDetected === requestResponsePairsCreated &&
  totalFiles === filesProcessed) {
  spinner.succeed();
}
else {
  spinner.warn();
}
console.error();
console.error(`Mocks created: ${mocksCreated}`);
console.error(`Mocks after dedupe: ${mocksAfterDedupe}`);