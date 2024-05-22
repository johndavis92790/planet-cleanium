const fs = require("fs");
const path = require("path");
const puppeteer = require("puppeteer");
const spawn = require("cross-spawn");

// To setup in new repo add output.md to .gitignore and run 'npm i puppeteer cross-spawn'
// Also create .vscode

// Function to copy text to clipboard
async function copyToClipboard(text) {
  const clipboardy = await import("clipboardy");
  await clipboardy.default.write(text);
}

// Function to read .gitignore file and return an array of patterns
function readGitignore(gitignorePath) {
  if (fs.existsSync(gitignorePath)) {
    return fs.readFileSync(gitignorePath, "utf-8").split("\n").filter(Boolean);
  }
  return [];
}

// Array of file patterns to exclude
const excludeFiles = [
  ...readGitignore(".gitignore"),
  "concat.js",
  "package-lock.json",
  "/node_modules",
  "/dist",
  "/build", 
  "/git",
  "/firebase",
  "/vscode",
  "/coverage",
  "*.jpg",
  "*.jpeg",
  "*.png",
  "*.gif",
  "*.bmp",
  "*.svg",
  "*.ico",
  "*.tif",
  "*.tiff",
  "*.psd",
  "*.ai",
  "*.eps",
  "*.indd",
  "*.pdf",
  "*.doc",
  "*.docx",
  "*.xls",
  "*.xlsx",
  "*.ppt",
  "*.pptx",
  "*.odt",
  "*.ods",
  "*.odp",
  "*.mp3",
  "*.wav",
  "*.aac",
  "*.m4a",
  "*.mp4",
  "*.avi",
  "*.mov",
  "*.wmv",
  "*.flv",
  "*.zip",
  "*.rar",
  "*.7z",
  "*.tar",
  "*.gz",
  "*.bz2",
  "*.log",
  "*.d.ts",
  "*.md",
];

// Function to check if a file should be included based on exclude patterns
function shouldIncludeFile(filePath) {
  const fileName = path.basename(filePath);
  return !excludeFiles.some((pattern) => {
    if (pattern.startsWith("*.")) {
      const extension = pattern.substring(1);
      return fileName.endsWith(extension);
    } else if (pattern.startsWith("/")) {
      return filePath.includes(pattern.substring(1));
    } else {
      return fileName === pattern;
    }
  });
}

// Function to get file paths recursively
function getFilePaths(dirPath, arrayOfFiles = []) {
  const files = fs.readdirSync(dirPath);

  files.forEach((file) => {
    const filePath = path.join(dirPath, file);
    if (fs.statSync(filePath).isDirectory() && filePath !== dirPath) {
      arrayOfFiles = getFilePaths(filePath, arrayOfFiles);
    } else {
      if (shouldIncludeFile(filePath)) {
        arrayOfFiles.push(filePath);
      }
    }
  });

  return arrayOfFiles;
}

// Function to count tokens in text
function countTokens(text) {
  const tokens = text.split(/\s+|[^\w\s]+/);
  const filteredTokens = tokens.filter((token) => token.length > 0);
  return filteredTokens.length;
}

// Helper function to run a command and capture its output
function runCommand(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: "pipe" });
    let output = "";
    let errorOutput = "";

    child.stdout.on("data", (data) => {
      output += data.toString();
    });

    child.stderr.on("data", (data) => {
      errorOutput += data.toString();
    });

    child.on("error", (error) => {
      reject(error);
    });

    child.on("close", () => {
      resolve({ output, errorOutput });
    });
  });
}

// Helper function to parse ESLint output and extract relevant information
function parseESLintOutput(output) {
  const eslintErrors = [];
  try {
    const parsedOutput = JSON.parse(output);
    parsedOutput.forEach((file) => {
      const relativePath = path.relative(__dirname, file.filePath);
      file.messages.forEach((message) => {
        const { line, ruleId, message: text } = message;
        const errorString = `[${relativePath}] Line ${line}: ${text} (${ruleId})`;
        eslintErrors.push(`${errorString}`);
      });
    });
  } catch (error) {
    console.error("Failed to parse ESLint output:", error);
  }
  return eslintErrors;
}

// Function to summarize TypeScript errors
function summarizeTypescriptErrors(output) {
  const lines = output.trim().split("\n");
  const typescriptErrors = lines.filter((line) => line.includes("error TS"));
  return typescriptErrors;
}

// Function to get the project name from the package.json file
function getProjectName() {
  const packageJsonPath = path.join(__dirname, "package.json");
  if (fs.existsSync(packageJsonPath)) {
    const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, "utf-8"));
    return packageJson.name;
  }
  return "Unknown Project";
}

// Function to generate the output in markdown format
function generateOutput(
  codeFiles,
  runtimeErrors,
  buildErrors,
  eslintErrors,
  typescriptErrors,
  summary
) {
  const uniqueCodeFiles = [...new Set(codeFiles)]; // Get unique code files

  const output = `# Overview
This file provides a summary of the codebase, including code files. Please provide the updated and
fixed code for each distinct file that requires changes to fix intentionally introduced errors
(runtime, build, ESLint, and TypeScript), along with concise corrections. Do not include files
that do not require any changes.

## Summary
${summary}

# Project: ${getProjectName()}

## Code Files

${uniqueCodeFiles.join("\n")}

## Runtime Errors

${runtimeErrors.length > 0 ? runtimeErrors.slice(0, 5).join("\n") : "No runtime errors found."}

## Build Errors

${buildErrors.length > 0 ? buildErrors.slice(0, 5).join("\n") : "No build errors found."}

## ESLint Errors

${eslintErrors.length > 0 ? eslintErrors.slice(0, 5).join("\n") : "No ESLint errors found."}

## TypeScript Errors

${typescriptErrors.length > 0 ? typescriptErrors.join("\n") : "No TypeScript errors found."}
`;

  return output;
}

// Function to get file content with file structure
function getFileContentWithStructure(filePath) {
  const relativeFilePath = path.relative(__dirname, filePath);
  // Exclude the output.md file
  if (relativeFilePath === "output.md") {
    return "";
  }
  const content = fs.readFileSync(filePath, "utf-8").trim();
  if (content.length === 0) {
    return ""; // Exclude empty files
  }
  return `[${relativeFilePath}]\n${content}\n...\n`;
}

(async () => {
  const browser = await puppeteer.launch();
  const page = await browser.newPage();

  // Inject a script to capture errors using window.onerror
  await page.evaluateOnNewDocument(() => {
    window.onerror = function (message, source, lineno, colno, error) {
      window.capturedErrors = window.capturedErrors || [];
      window.capturedErrors.push(error.stack);
    };
  });

  // Navigate to your React application URL
  await page.goto("http://localhost:3000");

  // Wait for the page to load and any errors to be logged
  await page.waitForSelector("body", { timeout: 5000 });

  // Add a delay to allow time for errors to be logged
  await new Promise((resolve) => setTimeout(resolve, 2000));

  // Retrieve the captured runtime errors
  const runtimeErrors = await page.evaluate(() => {
    return window.capturedErrors || [];
  });

  // Summarize runtime errors
  const summaryRuntimeErrors = runtimeErrors.map((error) => {
    const lines = error.split("\n");
    const firstLine = lines[0].trim();
    const fileInfo = lines.slice(1).find((line) => line.includes("at "));
    return `- ${firstLine}\n  ${fileInfo}`;
  });

  // Read the build error log from Create React App's error overlay
  let buildErrors = [];
  try {
    buildErrors = await page.evaluate(() => {
      const errorOverlay = document.querySelector(".react-error-overlay");
      if (errorOverlay) {
        return errorOverlay.innerText.trim().split("\n");
      }
      return [];
    });
  } catch (error) {
    console.error("Failed to retrieve build errors:", error);
  }

  // Run ESLint and capture the linting errors
  let eslintErrors = [];
  try {
    const eslintArgs = [
      "src",
      "--ext",
      ".js,.jsx,.ts,.tsx",
      "--format",
      "json",
    ];
    const eslintPath = path.join(
      __dirname,
      "node_modules",
      "eslint",
      "bin",
      "eslint.js"
    );
    const { output: eslintOutput } = await runCommand("node", [
      eslintPath,
      ...eslintArgs,
    ]);
    eslintErrors = parseESLintOutput(eslintOutput);
  } catch (error) {
    console.error("Failed to run ESLint:", error);
  }

  // Run TypeScript compiler and capture the TypeScript errors
  let typescriptErrors = [];
  try {
    const typescriptArgs = ["--noEmit", "--listEmittedFiles", "--diagnostics"];
    const typescriptPath = path.join(
      __dirname,
      "node_modules",
      "typescript",
      "bin",
      "tsc"
    );
    const { output: typescriptOutput } = await runCommand(
      typescriptPath,
      typescriptArgs
    );
    typescriptErrors = summarizeTypescriptErrors(typescriptOutput);
  } catch (error) {
    console.error("Failed to run TypeScript:", error);
  }

  // Clear the output.md file before getting file paths
  fs.writeFileSync("output.md", "");

  // Get the relevant code files with file structure
  const filePaths = getFilePaths(__dirname);
  const codeFiles = filePaths.map(getFileContentWithStructure);
  // Generate a summary
  const summary = `- Total files: ${filePaths.length}
- Lines of code: ${codeFiles.join("").split("\n").length}
- Runtime errors: ${summaryRuntimeErrors.length}
- Build errors: ${buildErrors.length}
- ESLint errors: ${eslintErrors.length}
- TypeScript errors: ${typescriptErrors.length}`;

  // Generate the output in markdown format
  const output = generateOutput(
    codeFiles,
    summaryRuntimeErrors,
    buildErrors,
    eslintErrors,
    typescriptErrors,
    summary
  );

  // Write the new output to the file
  fs.writeFileSync("output.md", output);

  // Copy the output to the clipboard
  await copyToClipboard(output);

  console.log("Output generated and copied to clipboard successfully!");
  console.log(summary);
  console.log(`- Token count: ${countTokens(output)}`);

  await browser.close();
})();
