#!/usr/bin/env node

const fs = require("fs");
const path = require("path");

function getFileSize(filePath) {
  const stats = fs.statSync(filePath);
  return stats.size;
}

function formatBytes(bytes) {
  if (bytes === 0) return "0 Bytes";
  const k = 1024;
  const sizes = ["Bytes", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
}

function analyzeBundle() {
  const distPath = path.join(__dirname, "..", "dist");

  if (!fs.existsSync(distPath)) {
    console.log("❌ Build directory not found. Run `npm run build` first.");
    return;
  }

  console.log("📦 Bundle Analysis\n");

  // Get all files recursively
  function getAllFiles(dirPath, arrayOfFiles = []) {
    const files = fs.readdirSync(dirPath);

    files.forEach((file) => {
      const fullPath = path.join(dirPath, file);
      if (fs.statSync(fullPath).isDirectory()) {
        arrayOfFiles = getAllFiles(fullPath, arrayOfFiles);
      } else {
        arrayOfFiles.push(fullPath);
      }
    });

    return arrayOfFiles;
  }

  const allFiles = getAllFiles(distPath);
  const jsFiles = allFiles.filter((file) => file.endsWith(".js"));
  const cssFiles = allFiles.filter((file) => file.endsWith(".css"));
  const assetFiles = allFiles.filter(
    (file) =>
      !file.endsWith(".js") && !file.endsWith(".css") && !file.endsWith(".html")
  );

  // Calculate total size
  const totalSize = allFiles.reduce((sum, file) => sum + getFileSize(file), 0);

  console.log(`**Total bundle size:** ${formatBytes(totalSize)}`);
  console.log(`**Files count:** ${allFiles.length}\n`);

  // JavaScript files
  if (jsFiles.length > 0) {
    console.log("**JavaScript files:**");
    jsFiles
      .map((file) => ({ file, size: getFileSize(file) }))
      .sort((a, b) => b.size - a.size)
      .slice(0, 10)
      .forEach(({ file, size }) => {
        const relativePath = path.relative(distPath, file);
        console.log(`  ${relativePath}: ${formatBytes(size)}`);
      });
    console.log("");
  }

  // CSS files
  if (cssFiles.length > 0) {
    console.log("**CSS files:**");
    cssFiles
      .map((file) => ({ file, size: getFileSize(file) }))
      .sort((a, b) => b.size - a.size)
      .forEach(({ file, size }) => {
        const relativePath = path.relative(distPath, file);
        console.log(`  ${relativePath}: ${formatBytes(size)}`);
      });
    console.log("");
  }

  // Asset files
  if (assetFiles.length > 0) {
    console.log("**Asset files:**");
    assetFiles
      .map((file) => ({ file, size: getFileSize(file) }))
      .sort((a, b) => b.size - a.size)
      .slice(0, 5)
      .forEach(({ file, size }) => {
        const relativePath = path.relative(distPath, file);
        console.log(`  ${relativePath}: ${formatBytes(size)}`);
      });
  }
}

analyzeBundle();
