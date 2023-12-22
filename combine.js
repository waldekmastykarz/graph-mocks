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
      mocks: []
    };

    for (let file of files[fileSet].files) {
      console.log(`  Adding ${file}...`);

      let data = JSON.parse(fs.readFileSync(file, 'utf8'));
      mocks.mocks = mocks.mocks.concat(data.mocks);
    }

    const total = mocks.mocks.length;

    console.log(`  Removing duplicates...`);
    // removing duplicates
    mocks.mocks = mocks.mocks.filter((mock, index, self) => {
      return self.findIndex(m => m.request.exampleUrl === mock.request.exampleUrl && m.request.method === mock.request.method) === index;
    });

    console.log(`  Removed ${total - mocks.mocks.length} duplicates`);

    // sort descending by URL length, so that the
    // most specific URLs are matched first
    mocks.mocks.sort((a, b) => b.request.url.length - a.request.url.length);

    fs.writeFileSync(files[fileSet].outputFile, JSON.stringify(mocks, null, 2));
    console.log(`  Saved to ${files[fileSet].outputFile}`);
  });

  console.log('Done!');
}

combine();