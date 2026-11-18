#!/usr/bin/env python3
import pathlib
import sys
import zipfile

source = pathlib.Path(sys.argv[1])
destination = pathlib.Path(sys.argv[2])
if not source.is_file() or source.stat().st_size == 0:
    raise SystemExit("Signed candidate APK is missing.")

removed = []
with zipfile.ZipFile(source, "r") as original, zipfile.ZipFile(destination, "w") as unsigned:
    for item in original.infolist():
        upper = item.filename.upper()
        if upper.startswith("META-INF/") and (
            upper.endswith((".RSA", ".DSA", ".EC", ".SF"))
            or upper == "META-INF/MANIFEST.MF"
        ):
            removed.append(item.filename)
            continue
        unsigned.writestr(item, original.read(item.filename))

if destination.stat().st_size == 0:
    raise SystemExit("Unsigned negative APK is empty.")
print(f"Created unsigned negative APK ({destination.stat().st_size} bytes); stripped {len(removed)} JAR signature entries. No signing key was generated or used.")
