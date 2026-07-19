/**
 * BYOND no-ad / no-guest-delay patch (logic from SijyKijy/ByondPatcher).
 * 512: dreamseeker.exe byte patches
 * 513-515: dreamseeker.exe MOV EDI,30 -> 0
 * 516+: byondcore.dll IsByondMember -> always true
 */

const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");

function readByondVersion(dreamseekerPath) {
  if (process.platform !== "win32") {
    return { major: 0, build: 0, raw: null };
  }
  // BYOND FileVersion looks like 5.0.516.1681 — the client series is the 3rd part (516),
  // not ProductMajorPart (which is often just 5).
  const ps = [
    `$v = (Get-Item -LiteralPath ${JSON.stringify(dreamseekerPath)}).VersionInfo`,
    `$parts = @()`,
    `if ($v.FileVersion) { $parts = $v.FileVersion -split '\\.' }`,
    `$series = 0`,
    `$rev = 0`,
    `if ($parts.Length -ge 3) { [void][int]::TryParse($parts[2], [ref]$series) }`,
    `if ($parts.Length -ge 4) { [void][int]::TryParse($parts[3], [ref]$rev) }`,
    `if ($series -le 0) { $series = $v.FileBuildPart }`,
    `if ($rev -le 0) { $rev = $v.FilePrivatePart }`,
    `Write-Output ("{0}|{1}|{2}" -f $series, $rev, $v.FileVersion)`,
  ].join("; ");
  try {
    const raw = execFileSync(
      "powershell.exe",
      ["-NoProfile", "-Command", ps],
      { encoding: "utf8", windowsHide: true, timeout: 8000 }
    )
      .toString()
      .trim();
    const [major, build, fileVersion] = raw.split("|");
    return {
      major: Number(major) || 0,
      build: Number(build) || 0,
      raw: fileVersion || raw,
    };
  } catch {
    return { major: 0, build: 0, raw: null };
  }
}

function matchesAt(buf, offset, pattern) {
  if (offset < 0 || offset + pattern.length > buf.length) {
    return false;
  }
  for (let i = 0; i < pattern.length; i += 1) {
    if (buf[offset + i] !== pattern[i]) {
      return false;
    }
  }
  return true;
}

function findPattern(buf, pattern, startPos = 0) {
  for (let i = startPos; i <= buf.length - pattern.length; i += 1) {
    if (matchesAt(buf, i, pattern)) {
      return i;
    }
  }
  return -1;
}

function rvaToFileOffset(pe, rva) {
  const peHeaderOffset = pe.readInt32LE(0x3c);
  const coffHeader = peHeaderOffset + 4;
  const optionalHeader = coffHeader + 20;
  const sectionCount = pe.readInt16LE(coffHeader + 2);
  const optionalHeaderSize = pe.readInt16LE(coffHeader + 16);
  const sectionsStart = optionalHeader + optionalHeaderSize;
  for (let i = 0; i < sectionCount; i += 1) {
    const sec = sectionsStart + i * 40;
    const sectionRva = pe.readInt32LE(sec + 12);
    const rawSize = pe.readInt32LE(sec + 16);
    const rawOffset = pe.readInt32LE(sec + 20);
    if (rva >= sectionRva && rva < sectionRva + rawSize) {
      return rawOffset + (rva - sectionRva);
    }
  }
  return -1;
}

function findExportOffset(pe, nameSubstring) {
  if (pe.length < 0x40 || pe[0] !== 0x4d || pe[1] !== 0x5a) {
    return -1;
  }
  const peHeaderOffset = pe.readInt32LE(0x3c);
  if (peHeaderOffset + 4 + 20 + 100 >= pe.length) {
    return -1;
  }
  const coffHeader = peHeaderOffset + 4;
  const optionalHeader = coffHeader + 20;
  const sectionCount = pe.readInt16LE(coffHeader + 2);
  const optionalHeaderSize = pe.readInt16LE(coffHeader + 16);
  const exportDirRva = pe.readInt32LE(optionalHeader + 96);
  if (!exportDirRva) {
    return -1;
  }
  const sectionsStart = optionalHeader + optionalHeaderSize;
  void sectionCount;
  void sectionsStart;

  const exportDir = rvaToFileOffset(pe, exportDirRva);
  if (exportDir < 0) {
    return -1;
  }
  const nameCount = pe.readInt32LE(exportDir + 24);
  const funcTable = rvaToFileOffset(pe, pe.readInt32LE(exportDir + 28));
  const nameTable = rvaToFileOffset(pe, pe.readInt32LE(exportDir + 32));
  const ordinalTable = rvaToFileOffset(pe, pe.readInt32LE(exportDir + 36));
  if (funcTable < 0 || nameTable < 0 || ordinalTable < 0) {
    return -1;
  }

  for (let i = 0; i < nameCount; i += 1) {
    const nameRva = pe.readInt32LE(nameTable + i * 4);
    const nameOffset = rvaToFileOffset(pe, nameRva);
    if (nameOffset < 0) {
      continue;
    }
    let end = nameOffset;
    while (end < pe.length && pe[end] !== 0) {
      end += 1;
    }
    const exportName = pe.slice(nameOffset, end).toString("ascii");
    if (!exportName.includes(nameSubstring)) {
      continue;
    }
    const ordinal = pe.readInt16LE(ordinalTable + i * 2);
    const funcRva = pe.readInt32LE(funcTable + ordinal * 4);
    return rvaToFileOffset(pe, funcRva);
  }
  return -1;
}

function patchExport(buf, exportSubstring, expectedBytes, patchBytes) {
  let offset = findExportOffset(buf, exportSubstring);
  if (offset < 0) {
    offset = findPattern(buf, expectedBytes);
  }
  if (offset < 0) {
    if (findPattern(buf, patchBytes) >= 0) {
      return { changed: false, already: true, name: exportSubstring };
    }
    return { changed: false, already: false, missing: true, name: exportSubstring };
  }
  if (matchesAt(buf, offset, patchBytes)) {
    return { changed: false, already: true, name: exportSubstring, offset };
  }
  if (!matchesAt(buf, offset, expectedBytes)) {
    return {
      changed: false,
      already: false,
      unexpected: true,
      name: exportSubstring,
      offset,
    };
  }
  Buffer.from(patchBytes).copy(buf, offset);
  return { changed: true, name: exportSubstring, offset };
}

function patchSequential(buf, pairs) {
  let position = 0;
  let changed = 0;
  for (const [pattern, replacement] of pairs) {
    const idx = findPattern(buf, pattern, position);
    if (idx >= 0) {
      Buffer.from(replacement).copy(buf, idx);
      position = idx + replacement.length;
      changed += 1;
    }
  }
  return changed;
}

function ensureBackup(filePath) {
  const bak = `${filePath}.bak`;
  if (!fs.existsSync(bak)) {
    fs.copyFileSync(filePath, bak);
    return bak;
  }
  return null;
}

function isMemberPatchApplied(corePath) {
  if (!fs.existsSync(corePath)) {
    return false;
  }
  const buf = fs.readFileSync(corePath);
  const patch = Buffer.from([0xb8, 0x01, 0x00, 0x00, 0x00, 0xc2, 0x04, 0x00]);
  const clientOff = findExportOffset(buf, "IsByondMember@DungClient");
  const pagerOff = findExportOffset(buf, "IsByondMember@DungPager");
  const clientOk =
    clientOff >= 0
      ? matchesAt(buf, clientOff, patch)
      : findPattern(buf, patch) >= 0;
  const pagerOk =
    pagerOff >= 0
      ? matchesAt(buf, pagerOff, patch)
      : findPattern(buf, patch) >= 0;
  // Enough if at least DungClient is patched (timer path).
  return clientOk || pagerOk;
}

function isLegacyDreamseekerPatched(dreamseekerPath, major) {
  const buf = fs.readFileSync(dreamseekerPath);
  if (major <= 512) {
    if (findPattern(buf, [0x0f, 0x45, 0xf9]) >= 0) {
      return false;
    }
    return findPattern(buf, [0x89, 0xcf, 0x90]) >= 0;
  }
  // 513-515: MOV EDI, 30 -> MOV EDI, 0
  if (findPattern(buf, [0xbf, 0x1e, 0x00, 0x00, 0x00]) >= 0) {
    return false;
  }
  // Heuristic: presence of BF 00 00 00 00 is too common; treat missing 1E pattern as patched
  // only if we also have a backup from us or stamp - for status, missing timer immediate is enough
  return true;
}

function getPatchTarget(dreamseekerPath) {
  const version = readByondVersion(dreamseekerPath);
  const dir = path.dirname(dreamseekerPath);
  const corePath = path.join(dir, "byondcore.dll");
  return { version, dreamseekerPath, corePath, dir };
}

function isByondNoAdPatched(dreamseekerPath) {
  if (!dreamseekerPath || !fs.existsSync(dreamseekerPath)) {
    return false;
  }
  const { version, corePath } = getPatchTarget(dreamseekerPath);
  if (version.major >= 516) {
    return isMemberPatchApplied(corePath);
  }
  return isLegacyDreamseekerPatched(dreamseekerPath, version.major);
}

/**
 * Apply patch in-memory and write to outPath (may be same as source).
 * Returns { ok, details, files: [{ path, buffer }] } for elevated copy.
 */
function buildPatchedBuffers(dreamseekerPath) {
  const { version, corePath } = getPatchTarget(dreamseekerPath);
  const details = [];
  const files = [];

  if (version.major >= 516) {
    if (!fs.existsSync(corePath)) {
      return {
        ok: false,
        error: `byondcore.dll не найден рядом с dreamseeker (${corePath})`,
        details,
        files,
        version,
      };
    }
    const buf = Buffer.from(fs.readFileSync(corePath));
    const patch = [0xb8, 0x01, 0x00, 0x00, 0x00, 0xc2, 0x04, 0x00];
    const r1 = patchExport(
      buf,
      "IsByondMember@DungClient",
      [0x55, 0x8b, 0xec, 0xff, 0x75, 0x08, 0xe8],
      patch
    );
    const r2 = patchExport(
      buf,
      "IsByondMember@DungPager",
      [0x55, 0x8b, 0xec, 0x8b, 0x49, 0x0c, 0x5d, 0xe9],
      patch
    );
    details.push(r1, r2);
    const changed = (r1.changed ? 1 : 0) + (r2.changed ? 1 : 0);
    const already = (r1.already ? 1 : 0) + (r2.already ? 1 : 0);
    if (changed === 0 && already === 0) {
      return {
        ok: false,
        error:
          "Не найдены функции IsByondMember в byondcore.dll (другая сборка BYOND?).",
        details,
        files,
        version,
      };
    }
    if (changed > 0) {
      files.push({ path: corePath, buffer: buf, backup: true });
    }
    return {
      ok: true,
      alreadyPatched: changed === 0 && already > 0,
      changed,
      details,
      files,
      version,
    };
  }

  if (version.major >= 513) {
    const buf = Buffer.from(fs.readFileSync(dreamseekerPath));
    const changed = patchSequential(buf, [
      [
        [0xbf, 0x1e, 0x00, 0x00, 0x00],
        [0xbf, 0x00, 0x00, 0x00, 0x00],
      ],
    ]);
    details.push({ name: "guest-delay-30", changed });
    if (changed === 0) {
      const already = findPattern(buf, [0xbf, 0x1e, 0x00, 0x00, 0x00]) < 0;
      return {
        ok: already,
        alreadyPatched: already,
        error: already
          ? null
          : "Не найден паттерн таймера (30 сек) в dreamseeker.exe.",
        changed,
        details,
        files: already ? [] : [],
        version,
      };
    }
    files.push({ path: dreamseekerPath, buffer: buf, backup: true });
    return { ok: true, changed, details, files, version };
  }

  // <= 512
  const buf = Buffer.from(fs.readFileSync(dreamseekerPath));
  const changed = patchSequential(buf, [
    [
      [0x0f, 0x45, 0xf9],
      [0x89, 0xcf, 0x90],
    ],
    [
      [0x74, 0x48],
      [0x90, 0x90],
    ],
    [
      [0x0f, 0x84, 0x44, 0x02, 0x00],
      [0x90, 0x90, 0x90, 0x90, 0x90],
    ],
    [
      [0x74, 0x4a],
      [0x90, 0x90],
    ],
    [
      [0x74, 0x3f],
      [0x90, 0x90],
    ],
    [
      [0x74, 0x0e],
      [0x90, 0x90],
    ],
    [
      [0x74, 0x0e],
      [0x90, 0x90],
    ],
    [
      [0x74, 0x4f],
      [0x90, 0x90],
    ],
  ]);
  details.push({ name: "legacy-ads", changed });
  if (changed === 0) {
    return {
      ok: isLegacyDreamseekerPatched(dreamseekerPath, version.major),
      alreadyPatched: true,
      changed: 0,
      details,
      files: [],
      version,
    };
  }
  files.push({ path: dreamseekerPath, buffer: buf, backup: true });
  return { ok: true, changed, details, files, version };
}

function writePatchedFiles(files) {
  for (const file of files) {
    if (file.backup) {
      ensureBackup(file.path);
    }
    fs.writeFileSync(file.path, file.buffer);
  }
}

module.exports = {
  readByondVersion,
  getPatchTarget,
  isByondNoAdPatched,
  buildPatchedBuffers,
  writePatchedFiles,
  ensureBackup,
};
