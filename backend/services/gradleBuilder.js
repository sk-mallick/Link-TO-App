const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const os = require('os');
require('dotenv').config({ path: path.join(__dirname, '../../.env') });

const JAVA_HOME = process.env.JAVA_HOME || 'C:\\Program Files\\Eclipse Adoptium\\jdk-21.0.7.6-hotspot';
const ANDROID_HOME = process.env.ANDROID_HOME || 'C:\\Users\\skmal\\AppData\\Local\\Android\\Sdk';
const BUILD_TOOLS = process.env.ANDROID_BUILD_TOOLS || '36.0.0';

/**
 * Run Gradle assemble inside the build directory
 * Returns the path to the generated APK
 * @param {string} buildDir
 * @param {string} jobId
 * @param {object} options { buildType: 'debug' | 'release', onLog: (text) => void }
 */
function build(buildDir, jobId, options = {}) {
  const { buildType = 'debug', onLog = null } = options;

  return new Promise((resolve, reject) => {
    const gradlew = path.join(buildDir, 'gradlew.bat');

    if (!fs.existsSync(gradlew)) {
      return reject(new Error('gradlew.bat not found in build directory'));
    }

    const env = {
      ...process.env,
      JAVA_HOME,
      ANDROID_HOME,
      ANDROID_SDK_ROOT: ANDROID_HOME,
      PATH: `"${path.join(JAVA_HOME, 'bin')}";"${path.join(ANDROID_HOME, 'platform-tools')}";"${path.join(ANDROID_HOME, 'build-tools', BUILD_TOOLS)}";${process.env.PATH}`,
    };

    const taskName = buildType === 'release' ? 'assembleRelease' : 'assembleDebug';

    console.log(`[${jobId}] Starting Gradle ${taskName} in: ${buildDir}`);

    const quotedGradlew = `"${gradlew}"`;

    const gradle = spawn(
      quotedGradlew,
      [taskName, '--no-daemon', '-x', 'lint'],
      {
        cwd: buildDir,
        env,
        shell: true,
        windowsHide: true,
      }
    );

    let stdout = '';
    let stderr = '';

    const handleOutput = (data, isError = false) => {
      const line = data.toString();
      if (isError) {
        stderr += line;
        process.stderr.write(`[gradle-err:${jobId.substring(0, 8)}] ${line}`);
      } else {
        stdout += line;
        process.stdout.write(`[gradle:${jobId.substring(0, 8)}] ${line}`);
      }
      if (typeof onLog === 'function') {
        onLog(line);
      }
    };

    gradle.stdout.on('data', (data) => handleOutput(data, false));
    gradle.stderr.on('data', (data) => handleOutput(data, true));

    gradle.on('close', async (code) => {
      if (code !== 0) {
        const errMsg = extractGradleError(stderr + stdout);
        return reject(new Error(`Gradle build failed (exit code ${code}): ${errMsg}`));
      }

      // Find the generated APK
      const apkPath = findApk(buildDir, buildType);
      if (!apkPath) {
        return reject(new Error('Build succeeded but APK file was not found in outputs directory'));
      }

      console.log(`[${jobId}] Build complete! APK: ${apkPath}`);
      resolve(apkPath);
    });

    gradle.on('error', (err) => {
      reject(new Error(`Failed to spawn Gradle process: ${err.message}`));
    });
  });
}

function findApk(buildDir, buildType = 'debug') {
  const candidates = [
    path.join(buildDir, `app/build/outputs/apk/${buildType}/app-${buildType}.apk`),
    path.join(buildDir, 'app/build/outputs/apk/debug/app-debug.apk'),
    path.join(buildDir, 'app/build/outputs/apk/release/app-release-unsigned.apk'),
    path.join(buildDir, 'app/build/outputs/apk/release/app-release.apk'),
  ];
  for (const p of candidates) {
    if (fs.existsSync(p)) return p;
  }
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
  const lines = output.split('\n');
  const errorLines = lines.filter(l =>
    l.includes('FAILURE') || l.includes('ERROR') || l.includes('error:') || l.includes('Exception')
  );
  if (errorLines.length > 0) return errorLines.slice(0, 4).join(' | ');
  return output.slice(-400);
}

module.exports = { build };
