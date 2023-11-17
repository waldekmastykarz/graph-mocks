'use strict';

const fs = require('fs');

const files = {
  'regular': {
    files: [
      'graph-v1_0-proxy-mocks.json',
      'graph-beta-proxy-mocks.json'
    ],
    outputFile: 'graph-proxy-mocks.json'
  },
  'sandbox': {
    files: [
      'graph-v1_0-proxy-mocks-sandbox.json',
      'graph-beta-proxy-mocks-sandbox.json'
    ],
    outputFile: 'graph-proxy-mocks-sandbox.json'
  }
}

function combine() {
  Object.getOwnPropertyNames(files).forEach(fileSet => {
    console.log(`Combining ${fileSet} mocks...`);

    const mocks = {
      responses: []
    };

    for (let file of files[fileSet].files) {
      console.log(`  Adding ${file}...`);

      let data = JSON.parse(fs.readFileSync(file, 'utf8'));
      mocks.responses = mocks.responses.concat(data.responses);
    }

    const total = mocks.responses.length;

    console.log(`  Removing duplicates...`);
    // removing duplicates
    mocks.responses = mocks.responses.filter((mock, index, self) => {
      return self.findIndex(m => m.exampleUrl === mock.exampleUrl && m.method === mock.method) === index;
    });

    console.log(`  Removed ${total - mocks.responses.length} duplicates`);

    // sort descending by URL length, so that the
    // most specific URLs are matched first
    mocks.responses.sort((a, b) => b.url.length - a.url.length);

    fs.writeFileSync(files[fileSet].outputFile, JSON.stringify(mocks, null, 2));
    console.log(`  Saved to ${files[fileSet].outputFile}`);
  });

  console.log('Done!');
}

combine();