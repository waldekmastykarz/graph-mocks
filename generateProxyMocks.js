'use strict';

const fs = require('fs');
const path = require('path');
const ora = require('ora');
const os = require('os');
require('url');
const { sanitizeUrl } = require('./sanitizeUrl');

const schemaUrl = 'https://raw.githubusercontent.com/dotnet/dev-proxy/main/schemas/v0.25.0/mockresponseplugin.mocksfile.schema.json';

/**
 * Initializes command line arguments
 * @returns {{docsPath: string, outputFile: string, graphVersion: string}} Object containing command line arguments
 */
function initArgs() {
  const args = process.argv.slice(2);
  if (args.length < 2) {
    console.error('Usage: node generateProxyMocks.js <path-to-graph-docs> <output-file> [v1.0|beta]');
    process.exit(1);
  }

  let docsPath = '';
  let outputFile = '';
  // used for changing server-relative URLs to absolute URLs
  let graphVersion = 'v1.0';

  for (let i = 0; i < args.length; i++) {
    const chunk = args[i];
    if (chunk === 'v1.0' || chunk === 'beta') {
      graphVersion = chunk;
      continue;
    }

    if (!fs.existsSync(chunk)) {
      outputFile = chunk;
      continue;
    }

    if (fs.statSync(chunk).isDirectory()) {
      docsPath = chunk;
    }
    else {
      outputFile = chunk;
    }
  }

  if (!docsPath) {
    console.error('Please, specify the path to Microsoft Graph docs');
    process.exit(1);
  }
  if (!outputFile) {
    console.error('Please, specify the output file');
    process.exit(1);
  }

  return { docsPath, outputFile, graphVersion };
}

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

/**
 * Gets the name of a log level
 * @param {number} level Log level
 * @returns {string} Name of the log level
 */
function getLogLevelName(level) {
  return Object.keys(LogLevel)[level];
}

/**
 * Writes a message to the log file
 * @param {string} message Message to write to the log file
 * @param {string} source File name or request URL that the message is associated with
 * @returns {void}
 */
function writeToLog(message, level, source) {
  if (currentLogLevel > level) {
    return;
  }

  const now = new Date();
  const chunks = [
    now.toISOString(),
    getLogLevelName(level),
    `${source.file}:${source.line}`,
    message,
    os.EOL
  ];
  fs.appendFileSync(logFileName, chunks.join('\t'));
}

/**
 * Gets all .md files in the graph-docs folder
 * @param {string} docsPath Relative path to the graph-docs folder
 * @param {function} callback Callback function that is called when all .md files are loaded
 */
function loadAllMdFiles(docsPath, callback) {
  fs.readdir(docsPath, (err, files) => {
    if (err) {
      console.error(err);
      process.exit(1);
    }

    const allFiles = [];

    files.forEach(file => {
      if (file.endsWith('.md')) {
        allFiles.push(path.join(docsPath, file));
      }
    });

    totalFiles = allFiles.length;
    updateProgress();

    callback(allFiles);
  });
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
  request.method = methodAndUrl.substring(0, firstSpaceIndex).trim();
  request.url = methodAndUrl.substring(firstSpaceIndex + 1).trim();

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
 * @param {function} callback Callback function that is called when request/response pairs are extracted
 */
function loadRequestResponsePairs(filePath, callback) {
  writeToLog(`Processing file ${filePath}`, LogLevel.DEBUG, { file: filePath, line: 0 });

  const requestResponsePairs = [];

  fs.readFile(filePath, 'utf8', (err, fileContents) => {
    if (err) {
      writeToLog(err, LogLevel.ERROR, {
        file: filePath,
        line: 0
      });
      filesProcessed++;
      updateProgress();
      callback(requestResponsePairs);
      return;
    }

    const lines = fileContents.split('\n');
    let inRequestBlock = false;
    let inResponseBlock = false;
    let codeBlockStartLineNumber = -1;
    let codeLines = [];

    let request;
    let response;

    lines.forEach((line, index) => {
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
        if (codeBlockStartLineNumber === -1) {
          codeBlockStartLineNumber = index;
          return;
        }
        // end code block
        if (codeBlockStartLineNumber > -1) {
          try {
            if (inRequestBlock) {
              requestsDetected++;
              writeToLog(`Parsing request from lines ${codeLines.join(os.EOL)}`, LogLevel.DEBUG, {
                file: filePath,
                line: codeBlockStartLineNumber
              });
              request = parseRequestBlock(codeLines);
              request.source = {
                file: filePath,
                line: codeBlockStartLineNumber
              }
              writeToLog(`Parsed request ${JSON.stringify(request, null, 2)}`, LogLevel.DEBUG, {
                file: filePath,
                line: codeBlockStartLineNumber
              });
              codeLines = [];
              inRequestBlock = false;
            }
            else if (inResponseBlock) {
              writeToLog(`Parsing response from lines ${codeLines.join(os.EOL)}`, LogLevel.DEBUG, {
                file: filePath,
                line: codeBlockStartLineNumber
              });
              response = parseResponseBlock(codeLines);
              response.source = {
                file: filePath,
                line: codeBlockStartLineNumber
              }
              writeToLog(`Parsed response ${JSON.stringify(response, null, 2)}`, LogLevel.DEBUG, {
                file: filePath,
                line: codeBlockStartLineNumber
              });
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
            writeToLog(ex, LogLevel.ERROR, {
              file: filePath,
              line: codeBlockStartLineNumber
            });
          }
          finally {
            codeBlockStartLineNumber = -1;
          }
          return;
        }
      }

      if (codeBlockStartLineNumber > -1) {
        codeLines.push(line);
      }
    });

    filesProcessed++;
    updateProgress();
    callback(requestResponsePairs);
  });
}

/**
 * Replaces segments of a Microsoft Graph request URL that represent IDs with wildcards
 * @param {{originalUrl: string, source: {file: string, line: number}, graphVersion: string}} params Object containing original URL, source file and line number, and Graph version
 * @returns {string} Microsoft Graph request URL with wildcards for segments that represent IDs
 */
function generalizeRequestUrl(params) {
  const { originalUrl, source, graphVersion } = params;

  let sanitizedUrl = originalUrl;

  if (!sanitizedUrl.startsWith('https://')) {
    let prepend = `https://graph.microsoft.com`;

    if (sanitizedUrl.indexOf('/v1.0/') < 0 && sanitizedUrl.indexOf('/beta/') < 0) {
      prepend += `/${graphVersion}`;
    }

    sanitizedUrl = `${prepend}${sanitizedUrl}`;
  }

  sanitizedUrl = sanitizeUrl(sanitizedUrl);
  // replace {} and <> tokens with asterisks
  sanitizedUrl = sanitizedUrl.replace(/([{<][^>}]+[}>])/g, '*');

  if (sanitizedUrl.trim().length === 0) {
    writeToLog(`Unable to generalize URL ${originalUrl}`, LogLevel.ERROR, source);
    return originalUrl;
  }

  writeToLog(`Generalized URL ${originalUrl} to ${sanitizedUrl}`, LogLevel.DEBUG, source);
  return sanitizedUrl;
}

/**
 * Converts a request/response pair to a proxy mock
 * @param {{request: {method: string, url: string, headers: object, body: string}, response: {statusCode: number, headers: object, body: string}}} requestResponse Request/response pair
 * @returns {{request: {url: string, method: string}, response: {statusCode: number, headers: object, body: string} }} Proxy mock
 */
function convertRequestResponseToProxyMock(requestResponse) {
  const { request, response } = requestResponse;
  const proxyMock = {
    request: {
      url: request.url,
      exampleUrl: request.originalUrl,
      method: request.method
    },
    response: {
      statusCode: response.statusCode,
      headers: response.headers ? Object.getOwnPropertyNames(response.headers).map(headerName => {
        return {
          name: headerName,
          value: response.headers[headerName]
        }
      }) : undefined
    }
  };
  if (response.body) {
    try {
      proxyMock.response.body = JSON.parse(response.body);
    }
    catch (ex) {
      proxyMock.response.body = response.body;
      writeToLog(ex, LogLevel.WARN, response.source);
    }
  }
  return proxyMock;
}

/**
 * Runs the script
 */
function run() {
  const { docsPath, outputFile, graphVersion } = initArgs();

  const proxyMocks = {
    mocks: []
  };

  loadAllMdFiles(docsPath, allFiles => {
    allFiles.forEach(filePath =>
      loadRequestResponsePairs(filePath, requestResponsePairs => {
        requestResponsePairs.forEach(pair => {
          pair.request.originalUrl = pair.request.url;
          pair.request.url = generalizeRequestUrl({
            originalUrl: pair.request.url,
            source: pair.request.source,
            graphVersion
          });
        });

        proxyMocks.mocks.push(...requestResponsePairs
          .map(convertRequestResponseToProxyMock)
          .filter(mock => mock !== undefined));

        if (filesProcessed < totalFiles) {
          return;
        }

        // sort descending by URL length, so that the
        // most specific URLs are matched first
        proxyMocks.mocks.sort((a, b) => b.request.url.length - a.request.url.length);

        const mocksCreated = proxyMocks.mocks.length;

        // dedupe proxy mocks by comparing URL and method
        proxyMocks.mocks = proxyMocks.mocks.filter((mock, index) =>
          index === proxyMocks.mocks.findIndex(m => m.request.url === mock.request.url && m.request.method === mock.request.method));

        const mocksAfterDedupe = proxyMocks.mocks.length;

        // add schema
        proxyMocks['$schema'] = schemaUrl;

        updateProgress();

        fs.writeFile(outputFile, JSON.stringify(proxyMocks, null, 2), err => {
          if (err) {
            spinner.fail(err);
            process.exit(1);
          }

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
        });
      }));
  });
}

run();