(function(global) {
    'use strict';

    var SMALL_FILE_THRESHOLD = 4096; // < 4KB 直接随差量包上传，减少清单体积与校验开销
    var CRC_TABLE = (function() {
        var table = new Uint32Array(256);
        for (var i = 0; i < 256; i++) {
            var c = i;
            for (var k = 0; k < 8; k++) {
                c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
            }
            table[i] = c >>> 0;
        }
        return table;
    })();

    function crc32(bytes) {
        var crc = 0xFFFFFFFF;
        for (var i = 0; i < bytes.length; i++) {
            crc = CRC_TABLE[(crc ^ bytes[i]) & 0xFF] ^ (crc >>> 8);
        }
        return (crc ^ 0xFFFFFFFF) >>> 0;
    }

    function toHex(buffer) {
        var bytes = new Uint8Array(buffer);
        var hex = '';
        for (var i = 0; i < bytes.length; i++) {
            var h = bytes[i].toString(16);
            hex += h.length === 1 ? '0' + h : h;
        }
        return hex;
    }

    function sha256Buffer(arrayBuffer) {
        return global.crypto.subtle.digest('SHA-256', arrayBuffer).then(toHex);
    }

    function isSupported() {
        return !!(global.crypto && global.crypto.subtle && typeof global.crypto.subtle.digest === 'function'
            && typeof global.DecompressionStream !== 'undefined'
            && typeof global.TextDecoder !== 'undefined'
            && typeof global.TextEncoder !== 'undefined');
    }

    function decodeFileName(bytes, isUtf8) {
        try {
            return new TextDecoder(isUtf8 ? 'utf-8' : 'utf-8', { fatal: false }).decode(bytes);
        } catch (e) {
            var out = '';
            for (var i = 0; i < bytes.length; i++) out += String.fromCharCode(bytes[i]);
            return out;
        }
    }

    function parseZipEntries(zipFile) {
        var tailSize = Math.min(zipFile.size, 65557);
        return zipFile.slice(zipFile.size - tailSize, zipFile.size).arrayBuffer().then(function(tailBuf) {
            var view = new DataView(tailBuf);
            var eocdOffset = -1;
            for (var i = tailBuf.byteLength - 22; i >= 0; i--) {
                if (view.getUint32(i, true) === 0x06054b50) {
                    var cLen = view.getUint16(i + 20, true);
                    if (i + 22 + cLen === tailBuf.byteLength) {
                        eocdOffset = i;
                        break;
                    }
                }
            }
            if (eocdOffset < 0) throw new Error('EOCD not found');

            var cdSize = view.getUint32(eocdOffset + 12, true);
            var cdOffset = view.getUint32(eocdOffset + 16, true);
            var totalEntries = view.getUint16(eocdOffset + 10, true);
            if (cdOffset === 0xFFFFFFFF || cdSize === 0xFFFFFFFF || totalEntries === 0xFFFF) {
                throw new Error('ZIP64 unsupported');
            }

            return zipFile.slice(cdOffset, cdOffset + cdSize).arrayBuffer().then(function(cdBuf) {
                var cdView = new DataView(cdBuf);
                var cdBytes = new Uint8Array(cdBuf);
                var pos = 0;
                var entries = [];
                while (pos + 46 <= cdBuf.byteLength) {
                    if (cdView.getUint32(pos, true) !== 0x02014b50) break;
                    var flags = cdView.getUint16(pos + 8, true);
                    var method = cdView.getUint16(pos + 10, true);
                    var compSize = cdView.getUint32(pos + 20, true);
                    var uncompSize = cdView.getUint32(pos + 24, true);
                    var nameLen = cdView.getUint16(pos + 28, true);
                    var extraLen = cdView.getUint16(pos + 30, true);
                    var commentLen = cdView.getUint16(pos + 32, true);
                    var localOffset = cdView.getUint32(pos + 42, true);
                    if (compSize === 0xFFFFFFFF || uncompSize === 0xFFFFFFFF || localOffset === 0xFFFFFFFF) {
                        throw new Error('ZIP64 entry unsupported');
                    }
                    if (flags & 1) throw new Error('Encrypted ZIP unsupported');
                    if (method !== 0 && method !== 8) throw new Error('Compression method unsupported: ' + method);

                    var nameBytes = cdBytes.subarray(pos + 46, pos + 46 + nameLen);
                    var name = decodeFileName(nameBytes, (flags & 0x0800) !== 0).replace(/\\/g, '/');
                    pos += 46 + nameLen + extraLen + commentLen;
                    if (!name || name.charAt(name.length - 1) === '/') continue;
                    entries.push({
                        path: name,
                        method: method,
                        compSize: compSize,
                        uncompSize: uncompSize,
                        localOffset: localOffset
                    });
                }
                return entries;
            });
        });
    }

    function extractEntryBytes(zipFile, entry) {
        return zipFile.slice(entry.localOffset, entry.localOffset + 30).arrayBuffer().then(function(hdrBuf) {
            var v = new DataView(hdrBuf);
            if (v.getUint32(0, true) !== 0x04034b50) throw new Error('Bad local header');
            var nLen = v.getUint16(26, true);
            var eLen = v.getUint16(28, true);
            var dataStart = entry.localOffset + 30 + nLen + eLen;
            var payloadBlob = zipFile.slice(dataStart, dataStart + entry.compSize);
            if (entry.method === 0) {
                return payloadBlob.arrayBuffer().then(function(buf) { return new Uint8Array(buf); });
            }
            var stream = payloadBlob.stream().pipeThrough(new global.DecompressionStream('deflate-raw'));
            return new global.Response(stream).arrayBuffer().then(function(buf) { return new Uint8Array(buf); });
        });
    }

    function buildStoredZipBlob(items) {
        var encoder = new global.TextEncoder();
        var parts = [];
        var central = [];
        var offset = 0;

        items.forEach(function(item) {
            var nameBytes = encoder.encode(item.path);
            var data = item.bytes;
            var sum = crc32(data);

            var localHdr = new ArrayBuffer(30 + nameBytes.length);
            var lv = new DataView(localHdr);
            lv.setUint32(0, 0x04034b50, true);
            lv.setUint16(4, 20, true);
            lv.setUint16(6, 0x0800, true);
            lv.setUint16(8, 0, true);
            lv.setUint16(10, 0, true);
            lv.setUint16(12, 0, true);
            lv.setUint32(14, sum, true);
            lv.setUint32(18, data.length, true);
            lv.setUint32(22, data.length, true);
            lv.setUint16(26, nameBytes.length, true);
            lv.setUint16(28, 0, true);
            new Uint8Array(localHdr, 30).set(nameBytes);

            parts.push(localHdr);
            parts.push(data);

            var cdHdr = new ArrayBuffer(46 + nameBytes.length);
            var cv = new DataView(cdHdr);
            cv.setUint32(0, 0x02014b50, true);
            cv.setUint16(4, 20, true);
            cv.setUint16(6, 20, true);
            cv.setUint16(8, 0x0800, true);
            cv.setUint16(10, 0, true);
            cv.setUint16(12, 0, true);
            cv.setUint16(14, 0, true);
            cv.setUint32(16, sum, true);
            cv.setUint32(20, data.length, true);
            cv.setUint32(24, data.length, true);
            cv.setUint16(28, nameBytes.length, true);
            cv.setUint16(30, 0, true);
            cv.setUint16(32, 0, true);
            cv.setUint16(34, 0, true);
            cv.setUint16(36, 0, true);
            cv.setUint32(38, 0, true);
            cv.setUint32(42, offset, true);
            new Uint8Array(cdHdr, 46).set(nameBytes);
            central.push(cdHdr);

            offset += localHdr.byteLength + data.length;
        });

        var cdSize = 0;
        central.forEach(function(c) {
            parts.push(c);
            cdSize += c.byteLength;
        });

        var eocd = new ArrayBuffer(22);
        var ev = new DataView(eocd);
        ev.setUint32(0, 0x06054b50, true);
        ev.setUint16(4, 0, true);
        ev.setUint16(6, 0, true);
        ev.setUint16(8, items.length, true);
        ev.setUint16(10, items.length, true);
        ev.setUint32(12, cdSize, true);
        ev.setUint32(16, offset, true);
        ev.setUint16(20, 0, true);
        parts.push(eocd);

        return new Blob(parts, { type: 'application/zip' });
    }

    function normalizeFolderPath(file, prefix) {
        var rel = String((file && (file._relativePath || file.webkitRelativePath || file.name)) || '').replace(/\\/g, '/').replace(/^\/+/, '');
        if (prefix && rel.indexOf(prefix) === 0) rel = rel.slice(prefix.length);
        return rel.replace(/^\/+/, '');
    }

    function computeCommonPrefix(files) {
        if (!files || files.length === 0) return '';
        var firstParts = normalizeFolderPath(files[0], '').split('/');
        if (firstParts.length <= 1) return '';
        var prefixParts = [];
        for (var pi = 0; pi < firstParts.length - 1; pi++) {
            var cand = firstParts[pi];
            var allMatch = true;
            for (var fi = 1; fi < files.length; fi++) {
                var curParts = normalizeFolderPath(files[fi], '').split('/');
                if (curParts.length <= pi + 1 || curParts[pi] !== cand) {
                    allMatch = false;
                    break;
                }
            }
            if (allMatch) prefixParts.push(cand);
            else break;
        }
        return prefixParts.length > 0 ? prefixParts.join('/') + '/' : '';
    }

    function prepareSmartUpload(source, rpFile, checkFn, onProgress) {
        if (!isSupported() || !source) {
            return Promise.resolve({ dedupUsed: false });
        }

        var notify = typeof onProgress === 'function' ? onProgress : function() {};
        var records = []; // { path, size, readBytes: () => Promise<Uint8Array>, hash }
        var totalBytes = 0;

        var collectPromise;
        if (source.type === 'zip' && source.file) {
            collectPromise = parseZipEntries(source.file).then(function(entries) {
                if (entries.length === 0 || entries.length > 30000) throw new Error('Entry count out of range');
                entries.forEach(function(entry) {
                    totalBytes += entry.uncompSize;
                    records.push({
                        path: entry.path,
                        size: entry.uncompSize,
                        readBytes: function() { return extractEntryBytes(source.file, entry); }
                    });
                });
            });
        } else if (source.type === 'folder' && source.files && source.files.length > 0) {
            if (source.files.length > 30000) return Promise.resolve({ dedupUsed: false });
            var effectivePrefix = (typeof source.packagePrefix === 'string') ? source.packagePrefix : computeCommonPrefix(source.files);
            source.files.forEach(function(f) {
                var rel = normalizeFolderPath(f, effectivePrefix);
                if (!rel) return;
                totalBytes += f.size;
                records.push({
                    path: rel,
                    size: f.size,
                    readBytes: function() {
                        return f.arrayBuffer().then(function(buf) { return new Uint8Array(buf); });
                    }
                });
            });
            collectPromise = Promise.resolve();
        } else {
            return Promise.resolve({ dedupUsed: false });
        }

        return collectPromise.then(function() {
            var idx = 0;
            var candidateHashes = [];
            var hashSeen = Object.create(null);

            function nextHash() {
                if (idx >= records.length) return Promise.resolve();
                var rec = records[idx++];
                if (idx === 1 || idx % 20 === 0 || idx === records.length) {
                    notify('scan', { current: idx, total: records.length });
                }
                if (rec.size < SMALL_FILE_THRESHOLD || rec.path.toLowerCase() === 'prototype.rp') {
                    return nextHash();
                }
                return rec.readBytes().then(function(bytes) {
                    rec._cachedBytes = bytes;
                    return sha256Buffer(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength));
                }).then(function(h) {
                    rec.hash = h;
                    if (!hashSeen[h]) {
                        hashSeen[h] = true;
                        candidateHashes.push(h);
                    }
                    return nextHash();
                });
            }

            var rpHashPromise = Promise.resolve('');
            if (rpFile) {
                rpHashPromise = rpFile.arrayBuffer().then(sha256Buffer).then(function(h) {
                    if (!hashSeen[h]) {
                        hashSeen[h] = true;
                        candidateHashes.push(h);
                    }
                    return h;
                });
            }

            return nextHash().then(function() {
                return rpHashPromise;
            }).then(function(rpComputedHash) {
                if (candidateHashes.length === 0) {
                    return { dedupUsed: false };
                }
                notify('check', { count: candidateHashes.length });
                return checkFn(candidateHashes).then(function(existingSet) {
                    if (!existingSet || existingSet.size === 0) {
                        return { dedupUsed: false };
                    }
                    var manifest = [];
                    var missingItems = [];
                    var savedBytes = 0;

                    var packIdx = 0;
                    function collectMissing() {
                        if (packIdx >= records.length) return Promise.resolve();
                        var rec = records[packIdx++];
                        if (rec.hash && existingSet.has(rec.hash)) {
                            manifest.push({ path: rec.path, hash: rec.hash, size: rec.size });
                            savedBytes += rec.size;
                            rec._cachedBytes = null;
                            return collectMissing();
                        }
                        var bytesPromise = rec._cachedBytes ? Promise.resolve(rec._cachedBytes) : rec.readBytes();
                        return bytesPromise.then(function(bytes) {
                            rec._cachedBytes = null;
                            missingItems.push({ path: rec.path, bytes: bytes });
                            return collectMissing();
                        });
                    }

                    return collectMissing().then(function() {
                        var zipBlob = missingItems.length > 0 ? buildStoredZipBlob(missingItems) : null;
                        var rpHit = !!(rpComputedHash && existingSet.has(rpComputedHash));
                        if (rpHit) savedBytes += rpFile.size;
                        return {
                            dedupUsed: true,
                            zipBlob: zipBlob,
                            manifest: manifest,
                            rpHash: rpHit ? rpComputedHash : '',
                            uploadRpFile: rpHit ? null : rpFile,
                            savedBytes: savedBytes,
                            totalBytes: totalBytes + (rpFile ? rpFile.size : 0),
                            missingCount: missingItems.length,
                            totalCount: records.length
                        };
                    });
                });
            });
        }).catch(function() {
            return { dedupUsed: false };
        });
    }

    global.ProtoZipDedup = {
        isSupported: isSupported,
        prepareSmartUpload: prepareSmartUpload
    };
})(window);
