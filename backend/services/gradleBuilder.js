const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const os = require('os');
require('dotenv').config({ path: path.join(__dirname, '../../.env') });

const JAVA_HOME = process.env.JAVA_HOME || 'C:\\Program Files\\Eclipse Adoptium\\jdk-21.0.7.6-hotspot';
const ANDROID_HOME = process.env.ANDROID_HOME || 'C:\\Users\\skmal\\AppData\\Local\\Android\\Sdk';

// Use short 8.3 paths to avoid spaces breaking cmd.exe
// Build jobs run from TEMP which is always a short, space-free path on Windows
const BUILDS_BASE = path.join(os.tmpdir(), 'lta-builds');

/**
 * Run Gradle assembleDebug inside the build directory
 * Returns the path to the generated APK
 */
function build(buildDir, jobId) {
  return new Promise((resolve, reject) => {
    const gradlew = path.join(buildDir, 'gradlew.bat');

    if (!fs.existsSync(gradlew)) {
      return reject(new Error('gradlew.bat not found in template'));
    }

    const env = {
      ...process.env,
      JAVA_HOME,
      ANDROID_HOME,
      ANDROID_SDK_ROOT: ANDROID_HOME,
      // Quote paths in PATH so cmd.exe handles spaces
      PATH: `"${path.join(JAVA_HOME, 'bin')}";"${path.join(ANDROID_HOME, 'platform-tools')}";${process.env.PATH}`,
    };

    console.log(`[${jobId}] Starting Gradle build in: ${buildDir}`);
    console.log(`[${jobId}] JAVA_HOME: ${JAVA_HOME}`);
    console.log(`[${jobId}] ANDROID_HOME: ${ANDROID_HOME}`);

    // CRITICAL: Quote the gradlew.bat path so cmd.exe doesn't split on spaces
    const quotedGradlew = `"${gradlew}"`;

    const gradle = spawn(
      quotedGradlew,
      ['assembleDebug', '--no-daemon', '-x', 'lint'],
      {
        cwd: buildDir,
        env,
        shell: true,   // needs shell:true on Windows for .bat files
        windowsHide: true,
      }
    );

    let stdout = '';
    let stderr = '';

    gradle.stdout.on('data', (data) => {
      const line = data.toString();
      stdout += line;
      process.stdout.write(`[gradle:${jobId.substring(0, 8)}] ${line}`);
    });

    gradle.stderr.on('data', (data) => {
      const line = data.toString();
      stderr += line;
      process.stderr.write(`[gradle-err:${jobId.substring(0, 8)}] ${line}`);
    });

    gradle.on('close', (code) => {
      if (code !== 0) {
        const errMsg = extractGradleError(stderr + stdout);
        return reject(new Error(`Gradle build failed (exit ${code}): ${errMsg}`));
      }

      // Find the generated APK
      const apkPath = findApk(buildDir);
      if (!apkPath) {
        return reject(new Error('Build succeeded but APK file not found'));
      }

      console.log(`[${jobId}] Build complete! APK: ${apkPath}`);
      resolve(apkPath);
    });

    gradle.on('error', (err) => {
      reject(new Error(`Failed to spawn Gradle: ${err.message}`));
    });
  });
}

function findApk(buildDir) {
  const candidates = [
    path.join(buildDir, 'app/build/outputs/apk/debug/app-debug.apk'),
    path.join(buildDir, 'app/build/outputs/apk/release/app-release-unsigned.apk'),
  ];
  for (const p of candidates) {
    if (fs.existsSync(p)) return p;
  }
  // Recursive search fallback
  return findApkRecursive(path.join(buildDir, 'app/build/outputs/apk'));
}

function findApkRecursive(dir) {
  if (!fs.existsSync(dir)) return null;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      const found = findApkRecursive(p);
      if (found) return found;
    } else if (entry.name.endsWith('.apk')) {
      return p;
    }
  }
  return null;
}

function extractGradleError(output) {
  // Try to pull the most useful error line
  const lines = output.split('\n');
  const errorLines = lines.filter(l =>
    l.includes('FAILURE') || l.includes('ERROR') || l.includes('error:') || l.includes('Exception')
  );
  if (errorLines.length > 0) return errorLines.slice(0, 3).join(' | ');
  return output.slice(-500); // Last 500 chars
}

module.exports = { build };
