const { execFileSync } = require("node:child_process");
const { createHash } = require("node:crypto");
const {
  closeSync,
  constants,
  existsSync,
  fsyncSync,
  lstatSync,
  mkdirSync,
  openSync,
  readFileSync,
  statSync,
  unlinkSync,
  writeFileSync,
} = require("node:fs");
const { resolve } = require("node:path");
const ethers = require("ethers");

const root = resolve(__dirname, "..");
const outputDirectory = resolve(root, "proof-output");
const outputPath = resolve(outputDirectory, "deployer-key.local.json");

function assertGitignored() {
  const ignoreLines = readFileSync(resolve(root, ".gitignore"), "utf8")
    .split(/\r?\n/u)
    .map((line) => line.trim());

  if (!ignoreLines.includes("proof-output/")) {
    throw new Error(
      "Refusing to create a key: proof-output/ is not explicitly listed in .gitignore."
    );
  }
}

function createEmptyFileExclusively() {
  mkdirSync(outputDirectory, { recursive: true, mode: 0o700 });
  const directory = lstatSync(outputDirectory);
  if (!directory.isDirectory() || directory.isSymbolicLink()) {
    throw new Error("Refusing to create a key: proof-output must be a real local directory.");
  }

  const fd = openSync(
    outputPath,
    constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY,
    0o600
  );
  closeSync(fd);
}

function securePosixPermissions() {
  const mode = statSync(outputPath).mode & 0o777;
  if (mode !== 0o600) {
    throw new Error(
      `Refusing to write a key: expected file mode 0600, observed 0${mode.toString(8)}.`
    );
  }
}

function secureWindowsPermissions() {
  const systemRoot = process.env.SystemRoot;
  if (!systemRoot) {
    throw new Error(
      "Refusing to write a key: SystemRoot is unavailable, so a private Windows ACL cannot be guaranteed."
    );
  }

  const whoami = resolve(systemRoot, "System32", "whoami.exe");
  const icacls = resolve(systemRoot, "System32", "icacls.exe");
  if (!existsSync(whoami) || !existsSync(icacls)) {
    throw new Error(
      "Refusing to write a key: whoami.exe/icacls.exe is unavailable, so a private Windows ACL cannot be guaranteed."
    );
  }

  const principal = execFileSync(whoami, [], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true,
  }).trim();
  if (!principal) {
    throw new Error(
      "Refusing to write a key: the current Windows principal could not be resolved."
    );
  }

  execFileSync(
    icacls,
    [outputPath, "/inheritance:r", "/grant:r", `${principal}:(F)`],
    { stdio: ["ignore", "pipe", "pipe"], windowsHide: true }
  );

  const aclOutput = execFileSync(icacls, [outputPath], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true,
  });
  const aclLines = aclOutput
    .split(/\r?\n/u)
    .map((line, index) => {
      const trimmed = line.trim();
      return index === 0 && trimmed.toLowerCase().startsWith(outputPath.toLowerCase())
        ? trimmed.slice(outputPath.length).trim()
        : trimmed;
    })
    .filter(
      (line) =>
        line.length > 0 &&
        !/^successfully processed /iu.test(line) &&
        !/^failed processing /iu.test(line)
    );

  const expected = `${principal}:(F)`.toLowerCase();
  if (aclLines.length !== 1 || aclLines[0].toLowerCase() !== expected) {
    throw new Error(
      "Refusing to write a key: a user-only, non-inherited Windows ACL could not be verified."
    );
  }
}

function removeEmptyOrPartialFile() {
  try {
    unlinkSync(outputPath);
    return true;
  } catch {
    return false;
  }
}

function main() {
  assertGitignored();
  createEmptyFileExclusively();

  try {
    if (process.platform === "win32") {
      secureWindowsPermissions();
    } else {
      securePosixPermissions();
    }

    // Generate only after the empty destination has verified private permissions.
    const wallet = ethers.Wallet.createRandom();
    const payload = Buffer.from(
      `${JSON.stringify(
        {
          address: wallet.address,
          privateKey: wallet.privateKey,
          network: "base-sepolia",
          createdAt: new Date().toISOString(),
        },
        null,
        2
      )}\n`,
      "utf8"
    );

    const fd = openSync(outputPath, constants.O_WRONLY | constants.O_TRUNC);
    try {
      writeFileSync(fd, payload);
      fsyncSync(fd);
    } finally {
      closeSync(fd);
    }

    if (process.platform === "win32") {
      secureWindowsPermissions();
    } else {
      securePosixPermissions();
    }

    const digest = createHash("sha256").update(payload).digest("hex");
    payload.fill(0);

    // Never print the private key or a command that embeds it.
    console.log(`ADDRESS=${wallet.address}`);
    console.log(`PATH=${outputPath}`);
    console.log(`FILE_SHA256=${digest}`);
  } catch (error) {
    if (!removeEmptyOrPartialFile()) {
      const reason = error instanceof Error ? error.message : "Unknown key-generation failure.";
      throw new Error(
        `${reason} Cleanup could not be verified; immediately restrict or remove ${outputPath}.`
      );
    }
    throw error;
  }
}

try {
  main();
} catch (error) {
  const message = error instanceof Error ? error.message : "Unknown key-generation failure.";
  console.error(message);
  console.error(
    "No new usable key was produced. Secure a local user-only directory/ACL, then rerun this command."
  );
  process.exitCode = 2;
}
