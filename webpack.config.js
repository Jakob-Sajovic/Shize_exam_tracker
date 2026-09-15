/* eslint-disable no-undef */
const path = require("path");
const webpack = require("webpack");
const HtmlWebpackPlugin = require("html-webpack-plugin");
const CopyWebpackPlugin = require("copy-webpack-plugin");

// Stamped into both the service worker cache name and the app bundle. A fresh
// value per build is what makes an installed app notice a redeploy at all.
const BUILD_ID = new Date()
  .toISOString()
  .replace(/[-:T]/g, "")
  .slice(0, 14);

module.exports = (env, options) => {
  const dev = options.mode === "development";

  return {
    devtool: dev ? "eval-source-map" : "source-map",
    entry: {
      app: ["core-js/stable", "regenerator-runtime/runtime", "./src/app/app.ts"],
    },
    output: {
      path: path.resolve(__dirname, "dist"),
      filename: "[name].js",
      // Named, stable chunk files so the service worker can pre-cache pdf.js
      chunkFilename: "[name].js",
      clean: true,
    },
    resolve: { extensions: [".ts", ".js"] },
    // Keep jsPDF inside pdf.js instead of a numbered vendor chunk, so the one
    // file the service worker pre-caches is all the PDF export needs offline.
    // (jsPDF's own optional imports — html2canvas, canvg, dompurify — still
    // split out; the report never calls the features that load them.)
    optimization: { splitChunks: { cacheGroups: { defaultVendors: false, default: false } } },
    module: {
      rules: [
        { test: /\.ts$/, exclude: /node_modules/, use: "babel-loader" },
        { test: /\.css$/, use: ["style-loader", "css-loader"] },
      ],
    },
    plugins: [
      new webpack.DefinePlugin({ __BUILD_ID__: JSON.stringify(BUILD_ID) }),
      new HtmlWebpackPlugin({
        template: "./src/index.html",
        filename: "index.html",
        chunks: ["app"],
      }),
      new CopyWebpackPlugin({
        patterns: [
          { from: "src/static", to: ".", globOptions: { ignore: ["**/sw.js"] } },
          {
            from: "src/static/sw.js",
            to: "sw.js",
            transform(content) {
              return content
                .toString()
                .replace('self.__BUILD_ID__ || "dev"', JSON.stringify(BUILD_ID));
            },
          },
        ],
      }),
    ],
    devServer: {
      static: { directory: path.join(__dirname, "dist") },
      port: 3100,
      host: "0.0.0.0",
      allowedHosts: "all",
      hot: false,
      liveReload: true,
    },
  };
};
