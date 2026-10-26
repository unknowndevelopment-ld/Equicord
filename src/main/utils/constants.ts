/*
 * Vencord, a modification for Discord's desktop app
 * Copyright (c) 2022 Vendicated and contributors
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program.  If not, see <https://www.gnu.org/licenses/>.
*/

import { app } from "electron";
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "fs";
import { join, resolve } from "path";

const suffix = IS_DEV ? "dev" : "";

export const DATA_DIR = process.env.EQUICORD_USER_DATA_DIR ?? (
    process.env.DISCORD_USER_DATA_DIR
        ? join(process.env.DISCORD_USER_DATA_DIR, "..", "EquicordData", suffix)
        : join(app.getPath("userData"), "..", "Equicord", suffix)
);

export const SETTINGS_DIR = join(DATA_DIR, "settings");
export const THEMES_DIR = join(DATA_DIR, "themes");
export const QUICK_CSS_PATH = join(SETTINGS_DIR, "quickCss.css");
export const SETTINGS_FILE = join(SETTINGS_DIR, "settings.json");
export const NATIVE_SETTINGS_FILE = join(SETTINGS_DIR, "native-settings.json");
export const DEV_MIGRATED = join(SETTINGS_DIR, "migration");

function mergeMissing(target: any, source: any): any {
    if (!target || typeof target !== "object" || Array.isArray(target)
        || !source || typeof source !== "object" || Array.isArray(source)) return target;

    for (const [key, value] of Object.entries(source)) {
        if (!(key in target)) {
            target[key] = value;
        } else if (target[key] && value && typeof target[key] === "object" && typeof value === "object"
            && !Array.isArray(target[key]) && !Array.isArray(value)) {
            mergeMissing(target[key], value);
        }
    }

    return target;
}

function migrateLegacyData() {
    const migrationMarker = join(SETTINGS_DIR, "hellocord-data-migration");
    if (existsSync(migrationMarker)) return;

    const dataRoots = new Set<string>();
    const addLegacyRoots = (userDataDir: string) => {
        dataRoots.add(resolve(userDataDir, "..", "VencordData", suffix));
        dataRoots.add(resolve(userDataDir, "..", "Vencord", suffix));
    };

    if (process.env.DISCORD_USER_DATA_DIR) addLegacyRoots(process.env.DISCORD_USER_DATA_DIR);
    addLegacyRoots(app.getPath("userData"));

    mkdirSync(SETTINGS_DIR, { recursive: true });
    let foundLegacyData = false;

    for (const root of dataRoots) {
        if (!existsSync(root)) continue;

        const legacySettingsDir = join(root, "settings");
        for (const fileName of ["settings.json", "native-settings.json"]) {
            const sourcePath = join(legacySettingsDir, fileName);
            if (!existsSync(sourcePath)) continue;

            try {
                const sourceData = JSON.parse(readFileSync(sourcePath, "utf-8"));
                const targetPath = join(SETTINGS_DIR, fileName);
                const targetData = existsSync(targetPath)
                    ? JSON.parse(readFileSync(targetPath, "utf-8"))
                    : {};
                const mergedData = mergeMissing(targetData, sourceData);
                writeFileSync(targetPath, JSON.stringify(mergedData, null, 4));
                foundLegacyData = true;
            } catch (err) {
                console.error(`Failed to migrate legacy ${fileName}`, err);
            }
        }

        const legacyQuickCss = join(legacySettingsDir, "quickCss.css");
        if (existsSync(legacyQuickCss) && !existsSync(QUICK_CSS_PATH)) {
            try {
                copyFileSync(legacyQuickCss, QUICK_CSS_PATH);
                foundLegacyData = true;
            } catch (err) {
                console.error("Failed to migrate legacy QuickCSS", err);
            }
        }

        const legacyThemesDir = join(root, "themes");
        if (existsSync(legacyThemesDir)) {
            try {
                mkdirSync(THEMES_DIR, { recursive: true });
                for (const fileName of readdirSync(legacyThemesDir)) {
                    const sourcePath = join(legacyThemesDir, fileName);
                    const targetPath = join(THEMES_DIR, fileName);
                    if (statSync(sourcePath).isFile() && !existsSync(targetPath)) {
                        copyFileSync(sourcePath, targetPath);
                        foundLegacyData = true;
                    }
                }
            } catch (err) {
                console.error("Failed to migrate legacy themes", err);
            }
        }
    }

    if (foundLegacyData) writeFileSync(migrationMarker, "migrated");
}

migrateLegacyData();

export const ALLOWED_PROTOCOLS = [
    "https:",
    "http:",
    "steam:",
    "spotify:",
    "com.epicgames.launcher:",
    "tidal:",
    "itunes:",
    "vrcx:",
    "tg:",
];

export const IS_VANILLA = /* @__PURE__ */ process.argv.includes("--vanilla");

if (IS_DEV) {
    const prodDir = join(DATA_DIR, "..");
    const settings = join(prodDir, "settings", "settings.json");
    const quickCss = join(prodDir, "settings", "quickCss.css");

    let migrated = false;
    if (existsSync(DEV_MIGRATED)) {
        const content = readFileSync(DEV_MIGRATED, "utf-8");
        migrated = content.includes("migrated");
    }

    if (!migrated) {
        setTimeout(() => {
            try {
                if (existsSync(settings)) copyFileSync(settings, SETTINGS_FILE);
                if (existsSync(quickCss)) copyFileSync(quickCss, QUICK_CSS_PATH);
                writeFileSync(DEV_MIGRATED, "migrated");
                app.relaunch();
                app.exit(0);
            } catch (err) {
                console.error("[Equicord] Failed to copy prod data:", err);
            }
        }, 5000);
    }
}
