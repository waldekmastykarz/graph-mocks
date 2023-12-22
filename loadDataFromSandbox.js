'use strict';

const fs = require('fs');
const ora = require('ora');
const os = require('os');

let totalRequests = 0;
let requestsCompleted = 0;
const spinner = ora('Loading data from the sandbox...').start();

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
  spinner.text = `Loading data from the sandbox: ${requestsCompleted}/${totalRequests} requests completed`;
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
 * @param {string} url Request URL that the message is associated with
 * @returns {void}
 */
function writeToLog(message, level, url) {
  if (currentLogLevel > level) {
    return;
  }

  const now = new Date();
  const chunks = [
    now.toISOString(),
    getLogLevelName(level),
    url,
    message,
    os.EOL
  ];
  fs.appendFileSync(logFileName, chunks.join('\t'));
}

/**
 * Initializes command line arguments
 * @returns {{inputFile, outputFile}} Command line arguments
 */
function initArgs() {
  const args = process.argv.slice(2);
  if (args.length < 1) {
    console.error('Usage: node loadDataFromSandbox.js <input-file> <output-file>');
    process.exit(1);
  }

  let inputFile = args[0];
  let outputFile = args[0];

  if (args.length > 1) {
    outputFile = args[1];
  }

  if (!fs.existsSync(inputFile)) {
    console.error(`File ${inputFile} does not exist`);
    process.exit(1);
  }

  return { inputFile, outputFile };
}

function loadMocksFile(proxyMocksFile, callback) {
  fs.readFile(proxyMocksFile, 'utf8', (err, data) => {
    if (err) {
      spinner.fail(`Error reading file ${proxyMocksFile}: ${err}`);
      process.exit(1);
    }

    try {
      const mocks = JSON.parse(data);
      callback(mocks);
    }
    catch (e) {
      spinner.fail(`Error parsing file ${proxyMocksFile}: ${e}`);
      process.exit(1);
    }
  });
}

async function downloadDataFromSandbox(mock) {
  writeToLog(`Downloading data from the sandbox`, LogLevel.DEBUG, mock.request.exampleUrl);
  let repeat = 0;

  while (repeat++ < 10) {
    writeToLog(`Attempt #${repeat}`, LogLevel.DEBUG, mock.request.exampleUrl);

    try {
      const response = await fetch(`https://graph.office.net/en-us/graph/api/proxy?url=${encodeURIComponent(mock.request.exampleUrl)}`, {
        headers: [
          ['Authorization', 'Bearer {token:https://graph.microsoft.com/}'],
          ['ConsistencyLevel', 'eventual']
        ]
      });

      writeToLog(`Response status: ${response.status}`, LogLevel.DEBUG, mock.request.exampleUrl);
      if (response.status !== 429) {
        const data = await response.json();
        if (data.error) {
          return {
            error: data.error,
            response: {
              mock,
              data: undefined
            }
          }
        }
        else {
          return {
            error: undefined,
            response: {
              mock,
              data
            }
          }
        }
      }

      if (response.headers.has('retry-after')) {
        const sleep = parseInt(response.headers.get('retry-after'), 10) * 1000;
        writeToLog(`Retry after: ${sleep}ms`, LogLevel.DEBUG, mock.request.exampleUrl);
        await new Promise(resolve => setTimeout(resolve, sleep));
      }
    }
    catch (error) {
      return {
        error,
        response: {
          mock,
          data: undefined
        }
      }
    }
  }

  return {
    error: 'Too many retries',
    response: {
      mock,
      data: undefined
    }
  }
}

async function run() {
  const { inputFile, outputFile } = initArgs();

  loadMocksFile(inputFile, async (mocks) => {
    const getMocks = mocks.mocks.filter(mock => mock.request.method === 'GET');
    totalRequests = getMocks.length;
    let hasErrors = false;

    for (const mock of getMocks) {
      const { error, response } = await downloadDataFromSandbox(mock);

      if (error) {
        hasErrors = true;
        writeToLog(JSON.stringify(error), LogLevel.ERROR, response.mock.request.exampleUrl);
      }
      else {
        writeToLog(`Downloaded data ${JSON.stringify(response.data)}`, LogLevel.INFO, response.mock.request.exampleUrl);
        response.mock.response.body = response.data;
      }

      requestsCompleted++;
      updateProgress();
    }

    fs.writeFile(outputFile, JSON.stringify(mocks, null, 2), err => {
      if (err) {
        spinner.fail(err);
        process.exit(1);
      }

      if (hasErrors) {
        spinner.warn(`Finished with errors. See ${logFileName} for details.`);
      }
      else {
        spinner.succeed();
      }
    });
  });
}

run();