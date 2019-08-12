// ==LICENSE-BEGIN==
// Copyright 2017 European Digital Reading Lab. All rights reserved.
// Licensed to the Readium Foundation under one or more contributor license agreements.
// Use of this source code is governed by a BSD-style license
// that can be found in the LICENSE file exposed on Github (readium) in the project repository.
// ==LICENSE-END=

import * as debug_ from "debug";
import { app, BrowserWindow, Menu, shell } from "electron";
import * as path from "path";
import { AppWindowType } from "readium-desktop/common/models/win";
import {
    getWindowsRectangle,
} from "readium-desktop/common/rectangle/window";
import { Translator } from "readium-desktop/common/services/translator";
import { container } from "readium-desktop/main/di";
import { WinRegistry } from "readium-desktop/main/services/win-registry";
import {
    _PACKAGING, _RENDERER_APP_BASE_URL, IS_DEV,
} from "readium-desktop/preprocessor-directives";

// Logger
const debug = debug_("readium-desktop:createWindow");

// Global reference to the main window,
// so the garbage collector doesn't close it.
let mainWindow: BrowserWindow = null;

// Opens the main window, with a native menu bar.
export async function createWindow() {
    mainWindow = new BrowserWindow({
        ...(await getWindowsRectangle()),
        minWidth: 800,
        minHeight: 600,
        webPreferences: {
            devTools: IS_DEV,
            nodeIntegration: true, // Required to use IPC
            webSecurity: false,
            allowRunningInsecureContent: false,
        },
        icon: path.join(__dirname, "assets/icons/icon.png"),
    });
    const winRegistry = container.get("win-registry") as WinRegistry;
    const appWindow = winRegistry.registerWindow(mainWindow, AppWindowType.Library);

    // watch to record window rectangle position in the db
    appWindow.onWindowMoveResize.attach();

    let rendererBaseUrl = _RENDERER_APP_BASE_URL;

    if (rendererBaseUrl === "file://") {
        // dist/prod mode (without WebPack HMR Hot Module Reload HTTP server)
        rendererBaseUrl += path.normalize(path.join(__dirname, "index_app.html"));
    } else {
        // dev/debug mode (with WebPack HMR Hot Module Reload HTTP server)
        rendererBaseUrl += "index_app.html";
    }

    rendererBaseUrl = rendererBaseUrl.replace(/\\/g, "/");

    mainWindow.loadURL(rendererBaseUrl);

    // Create the app menu on mac os to allow copy paste
    if (process.platform === "darwin") {
        initDarwin();
    }

    if (IS_DEV) {
        const {
            default: installExtension,
            REACT_DEVELOPER_TOOLS,
            REDUX_DEVTOOLS,
        } = require("electron-devtools-installer");

        [REACT_DEVELOPER_TOOLS, REDUX_DEVTOOLS].forEach((extension) => {
            installExtension(extension)
                .then((name: string) => debug("Added Extension: ", name))
                .catch((err: any) => debug("An error occurred: ", err));
        });

        // Open dev tools in development environment
        mainWindow.webContents.openDevTools();
    } else {
        // Remove menu bar
        mainWindow.setMenu(null);
    }

    // Redirect link to an external browser
    const handleRedirect = (event: any, url: any) => {
        if (url === mainWindow.webContents.getURL()) {
            return;
        }

        event.preventDefault();
        shell.openExternal(url);
    };

    mainWindow.webContents.on("will-navigate", handleRedirect);
    mainWindow.webContents.on("new-window", handleRedirect);

    // Clear all cache to prevent weird behaviours
    // Fully handled in r2-navigator-js initSessions();
    // (including exit cleanup)
    // mainWindow.webContents.session.clearStorageData();

    mainWindow.on("closed", () => {
        // note that winRegistry still contains a reference to mainWindow, so won't necessarily be garbage-collected
        mainWindow = null;
    });
}

// On OS X it's common to re-create a window in the app when the dock icon is clicked and there are no other
// windows open.
app.on("activate", async () => {
    if (mainWindow === null) {
        await createWindow();
    }
});

export function initDarwin() {
    const translator = container.get("translator") as Translator;
    const template: Electron.MenuItemConstructorOptions[] = [
        {
            label: "Thorium",
            submenu: [
                {
                    role: "quit",
                    label: translator.translate("app.quit"),
                },
            ],
        },
        {
            label: translator.translate("app.edit.title"),
            role: "edit",
            submenu: [
                {
                    role: "undo",
                    label: translator.translate("app.edit.undo"),
                },
                {
                    role: "redo",
                    label: translator.translate("app.edit.redo"),
                },
                {
                    type: "separator",
                },
                {
                    role: "cut",
                    label: translator.translate("app.edit.cut"),
                },
                {
                    role: "copy",
                    label: translator.translate("app.edit.copy"),
                },
                {
                    role: "paste",
                    label: translator.translate("app.edit.paste"),
                },
                {
                    role: "selectall",
                    label: translator.translate("app.edit.selectAll"),
                },
            ],
        },
    ];
    Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}