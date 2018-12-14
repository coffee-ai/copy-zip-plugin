# copy-zip-plugin

## Installation
```bash
npm install copy-zip-plugin -D

```

## Usage

```js
const CopyZipPlugin = require('copy-zip-plugin')

const config = {
  plugins: [
    new CopyZipPlugin([
    {
      from: path.join(__dirname, '../dist/a/index.js'),
      to: path.join(__dirname, '../dist/index.js')
    }], {
      exclude: /\.zip$/i,
      path: path.join(__dirname, '../dist'),
      filename: `${name}.zip`
    })
  ]
}
```
