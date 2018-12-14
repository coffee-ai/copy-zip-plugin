'use strict';

var path = require('path')
var fs = require('fs')
var chalk = require('chalk')
var RawSource = require('webpack-sources').RawSource
var yazl = require('yazl')

function CopyZipPlugin(pattens, options) {
  this.pattens = pattens || [];
  this.options = options || {};
}

CopyZipPlugin.prototype.apply = function(compiler) {
  var options = this.options;
  var pattens = this.pattens;
  var context = compiler.options.output.path;
  var zipContext = options.context || compiler.options.output.path;
  var getPath = function(p) {
    if (!path.isAbsolute(p)) {
      p = path.join(context, p);
    }
    return p;
  };
  var getKey = function(src) {
    if (path.isAbsolute(src)) {
      src = path.relative(context, src);
    }
    return src.replace(/\\/g, '/');
  };
  var emit = function(compilation, callback) {
    var tasks = [];
    var copyFile = function(from, to) {
      return new Promise(function(resolve, reject) {
        // 若为编译的文件，则设置assets，否则复制文件
        var key = getKey(from);
        if (compilation.assets.hasOwnProperty(key)) {
          var relativePath = getKey(to);
          compilation.assets[relativePath] = compilation.assets[key];
          return resolve();
        }
        fs.exists(from, function(isExist) {
          if (isExist) {
            fs.stat(from, function(err, info) {
              if (err) {
                reject(err);
              }
              if (info.isFile()) {
                var readStream = fs.createReadStream(from);
                var writeStream = fs.createWriteStream(to);
                readStream.pipe(writeStream);
              }
            });
          }
          return resolve();
        })
      })
    };
    var zipFile = function() {
      if (!options.filename) return Promise.resolve();
      return new Promise(function(resolve, reject) {
        if (compilation.compiler.isChild()) {
          callback();
          return;
        }
        var zip = new yazl.ZipFile();
        var tasks = [];
        for (var key in compilation.assets) {
          if (compilation.assets.hasOwnProperty(key)) {
            var source = compilation.assets[key].source();
            zip.addBuffer(
              Buffer.isBuffer(source) ? source : new Buffer(source),
              path.join('', key),
              options.fileOptions
            )
          }
        }
        // 添加原版本的文件
        // 不包含新编译产生的文件
        var statFile = function(filedir) {
          return new Promise(function(resolve, reject) {
            fs.stat(filedir, function(err, info) {
              if (err) {
                reject(err);
              }
              var relativePath = path.relative(
                context,
                filedir
              );
              if (info.isFile()) {
                if (!options.exclude || !options.exclude.test(filedir)) {
                  var key = getKey(filedir);
                  if (!compilation.assets.hasOwnProperty(key)) {
                    zip.addFile(filedir, relativePath);
                  }
                }
                resolve();
              } else if (info.isDirectory()) {
                if (!fs.existsSync(filedir)) {
                  zip.addEmptyDirectory(relativePath);
                }
                fs.readdir(filedir, function(err, files) {
                  var ergodicTasks = [];
                  if (!err) {
                    files.forEach(function(filename) {
                      var newPath = path.join(filedir, filename);
                      ergodicTasks.push(Promise.resolve().then(() => statFile(newPath)));
                    })
                  }
                  Promise.all(ergodicTasks).then(() => resolve());
                })
              }
            })
          })
        };

        statFile(compilation.options.output.path).then(() => {
          zip.end(options.zipOptions);
        }).catch((err) => {
          compilation.errors.push(err);
        })
        
        var buffers = [];
        zip.outputStream.on('data', function(buf) {
          buffers.push(buf);
        })
        zip.outputStream.on('end', function() {
          var outputPath = options.path || compilation.options.output.path;
          var outputFilename = options.filename || compilation.options.output.filename || path.basename(outputPath);
          var extension = '.' + (options.extension || 'zip');
          var outputPathAndFilename = path.resolve(
            zipContext,
            outputPath,
            path.basename(outputFilename, '.zip') + extension
          );
          var relativePath = path.relative(
            compilation.options.output.path,
            outputPathAndFilename
          );
          var key = getKey(relativePath);
          compilation.assets[key] = new RawSource(Buffer.concat(buffers));
          resolve();
        })
      })
    };
    pattens.forEach(function(patten) {
      var from = getPath(patten.from);
      var to = getPath(patten.to);
      tasks.push(Promise.resolve().then(() => copyFile(from, to)));
    });
    Promise.all(tasks)
      .then(() => zipFile())
      .then(() => callback())
      .catch((err) => {compilation.errors.push(err);});
  };
  if (compiler.hooks) {
    compiler.hooks.emit.tapAsync(CopyZipPlugin.name, emit);
  } else {
    compiler.plugin('emit', emit);
  }
}

module.exports = CopyZipPlugin;