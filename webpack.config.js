const path = require('path');
module.exports = {
  entry: './components/index.jsx',
  output: {
    path: path.resolve('source/javascripts'),
    filename: 'bundle.js'
  },
  module: {
    loaders: [
      { test: /\.js$/, loader: 'babel-loader', exclude: /node_modules/ },
      { test: /\.jsx$/, loader: 'babel-loader', exclude: /node_modules/ }
    ]
  },
  externals: {
    react: 'React',
    "react-dom": 'ReactDOM'
  }
}