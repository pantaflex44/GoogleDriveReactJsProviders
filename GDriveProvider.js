import React, { createContext, useContext, useEffect, useState } from 'react';
import { gapi } from 'gapi-script';

import "@fontsource/roboto";

/**
 * Google SVG Logo
 * @param {*} width In pixels
 * @param {*} height In pixels
 * @returns 
 */
const GoogleLogo = (width = 24, height = 24) => {
    const G = useContext(GDriveContext);

    const parts = [
        <path key="g-logo-blue"
            d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
            fill="#4285F4" />,
        <path key="g-logo-green"
            d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
            fill="#34A853" />,
        <path key="g-logo-yellow"
            d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
            fill="#FBBC05" />,
        <path key="g-logo-red"
            d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
            fill="#EA4335" />
    ];

    return <svg
        width={width}
        height={height}
        viewBox={`0 0 ${width} ${height}`}
        style={{
            width: '24px',
            height: '24px',
            filter: G.loading ? 'grayscale(1) opacity(0.5)' : 'none'
        }}
    >
        {parts}
        <path d="M1 1h22v22H1z" fill="none" />
    </svg>;
};

/**
 * Google Drive Context
 */
export const GDriveContext = createContext();

/**
 * Google Drive Provider
 * @param {*} props {boolean debug: true|false, string apiKey: Google API Key, string clientId: Google Drive client ID, string appFolderName: App name, boolean useAppFolder: true|false }
 * @returns 
 */
export default function GDriveProvider(props) {
    const debug = (props.debug ?? false) === true;
    const apiKey = props.apiKey ?? process.env.GOOGLE_DRIVE_API_KEY;
    const clientId = props.clientId ?? process.env.GOOGLE_CLIENT_ID;
    const discoveryRestAPI = 'https://www.googleapis.com/discovery/v1/apis/drive/v3/rest';
    const metadataScope = 'https://www.googleapis.com/auth/drive.metadata.readonly';
    const allaccessScope = 'https://www.googleapis.com/auth/drive';
    const expectedScopes = `${metadataScope} ${allaccessScope}`;
    const appFolderName = props.appFolderName ?? process.env.APP_NAME;
    const useAppFolder = (props.useAppFolder ?? false) === true;



    const [folders, setFolders] = useState({
        rootId: null
    });
    const [state, setState] = useState({
        authentificationError: null,
        isAuthentificated: false,
        user: null,
        profile: null,
    });
    const [loading, setLoading] = useState(false);


    const humanFileSize = (bytes, si = false, dp = 1) => {
        const thresh = si ? 1000 : 1024;

        if (Math.abs(bytes) < thresh) {
            return bytes + ' B';
        }

        const units = si
            ? ['kB', 'MB', 'GB', 'TB', 'PB', 'EB', 'ZB', 'YB']
            : ['KiB', 'MiB', 'GiB', 'TiB', 'PiB', 'EiB', 'ZiB', 'YiB'];
        let u = -1;
        const r = 10 ** dp;

        do {
            bytes /= thresh;
            ++u;
        } while (Math.round(Math.abs(bytes) * r) / r >= thresh && u < units.length - 1);


        return bytes.toFixed(dp) + ' ' + units[u];
    };


    const clearState = () => {
        setState((old) => ({
            ...old,
            authentificationError: null,
            isAuthentificated: false,
            user: null,
            profile: null
        }));

        setFolders({
            rootId: null
        });

        setLoading(false);
    }

    const setStateConnected = () => {
        if (state.authentificationError !== null || state.isAuthentificated !== true) {
            setState((old) => ({
                ...old,
                authentificationError: null,
                isAuthentificated: true
            }));
        }
    }

    const setStateError = (error) => {
        setLoading(false);

        if (state.authentificationError !== error) {
            setState((old) => ({
                ...old,
                authentificationError: error
            }));
        }
    }

    const updateGrantedScopes = async (user) => {
        if (!loading) setLoading(true);

        if (user?.getGrantedScopes()) {
            const scopes = user.getGrantedScopes().split(" ");
            if (!scopes.includes(metadataScope) || !scopes.includes(allaccessScope)) {
                if (debug) console.log('GDriveProvider', 'Update granted scopes');

                await user.grant({
                    scope: expectedScopes
                });
            }

            if (debug) console.log('GDriveProvider', 'Get root folder ID');

            const rootFolderId = await getRootFolderID(true);
            let dir = { rootId: rootFolderId };

            if (useAppFolder) {
                if (debug) console.log('GDriveProvider', 'Get app folder ID');

                const appFolderId = await getAppFolderId(rootFolderId);
                dir = { ...dir, appId: appFolderId };
            }

            setFolders((old) => ({
                ...old,
                ...dir
            }));
        }

        return user;
    }

    const setStateInfos = (user) => {
        if (!loading) setLoading(true);

        if (user) {
            if (debug) console.log('GDriveProvider', 'Get current user profile');

            const profile = user.getBasicProfile();
            const email = profile.getEmail();
            const avatarUrl = profile.getImageUrl();
            const familyName = profile.getFamilyName();
            const givenName = profile.getGivenName();
            const name = profile.getName();
            const id = profile.getId();

            const auth = user.getAuthResponse();
            const access_token = auth.access_token;

            setState((old) => ({
                ...old,
                user: { ...user, access_token },
                profile: { id, email, name, givenName, familyName, avatarUrl }
            }));
        }

        setLoading(false);
    }

    const updateSigninStatus = (isSignedIn) => {
        if (isSignedIn) {
            if (debug) console.log('GDriveProvider', 'Google user signed in');

            updateGrantedScopes(gapi.auth2.getAuthInstance().currentUser.get())
                .then((user) => {
                    setStateInfos(user);

                    setStateConnected();
                })
                .catch((error) => setStateError(error));

        } else {
            clearState();
        }
    };



    const signIn = () => {
        if (debug) console.log('GDriveProvider', 'Google user, manual sign in');

        setLoading(true);
        gapi.auth2.getAuthInstance().signIn()
            .then(
                (response) => { },
                (error) => {
                    setStateError(error);
                    if (error.error === 'popup_closed_by_user') clearState();
                }
            )
    };

    const signOut = () => {
        if (debug) console.log('GDriveProvider', 'Google user, manual sign out');

        gapi.auth2.getAuthInstance().disconnect();
    }



    const getRootFolderID = async (force = false) => {
        if (folders.rootId !== null && !force) return folders.rootId;

        const response = await gapi.client.drive.files.get({
            fileId: 'root'
        });
        const res = JSON.parse(response.body);

        return res.id;
    };

    const getAppFolderId = async (parentFolderId, force = false) => {
        if (folders.appId && !force) return folders.appId;

        const folderId = await folderExists(appFolderName, parentFolderId);
        if (folderId !== false) {
            if (debug) console.log('GDriveProvider', 'App folder allready created');

            return folderId;
        } else {
            if (debug) console.log('GDriveProvider', 'Create app folder');

            return await createFolder(appFolderName, parentFolderId);
        }
    };



    const folderExists = async (name, parentId) => {
        const response = await gapi.client.drive.files
            .list({
                fields: 'files(id, name, mimeType, parents)',
                q: `mimeType='application/vnd.google-apps.folder' and '${parentId}' in parents and name = '${name}' and trashed = false`,
                space: 'drive'
            });
        const res = JSON.parse(response.body);

        return res.files.length > 0 ? res.files[0].id : false;
    };

    const createFolder = async (name, parentId) => {
        const response = await gapi.client.drive.files.create({
            resource: {
                name: name,
                mimeType: 'application/vnd.google-apps.folder',
                parents: [parentId]
            },
            fields: 'id'
        });
        const res = JSON.parse(response.body);

        return res.id;
    };

    const fileExists = async (filename, parentId) => {
        const response = await gapi.client.drive.files.list({
            fields: 'files(id, name, mimeType, parents)',
            q: `name='${filename}' and '${parentId}' in parents and trashed = false`
        });
        const res = JSON.parse(response.body);

        return res.files.length > 0 ? res.files[0].id : false;
    };

    const writeBlob = async (filename, parentId, body, mimeType) => {
        let fileId = await fileExists(filename, parentId);

        if (fileId === false) {
            const response = await gapi.client.drive.files.create({
                'content-type': mimeType,
                uploadType: 'multipart',
                name: filename,
                mimeType: mimeType,
                parents: [parentId],
                fields: 'id'
            });
            fileId = JSON.parse(response.body).id;
        }

        const fetchResponse = await fetch(`https://www.googleapis.com/upload/drive/v3/files/${fileId}`, {
            method: 'PATCH',
            headers: new Headers({
                'Authorization': `Bearer ${gapi.client.getToken().access_token}`,
                'Content-Type': mimeType
            }),
            body
        });

        return fileId;
    };

    const writeText = async (filename, parentId, text) => {
        const blob = new Blob([text], { type: 'text/plain' });
        return await writeBlob(filename, parentId, blob, 'text/plain');
    };

    const writeJson = async (filename, parentId, json) => {
        const blob = new Blob([JSON.stringify(json)], { type: 'text/plain' });
        return await writeBlob(filename, parentId, blob, 'application/json');
    };

    const readFile = async (fileId) => {
        const file = await gapi.client.drive.files.get({
            fileId: fileId,
            alt: 'media',
        });

        return file.body;
    };

    const readImageToBase64 = async (fileId, imageMimeType) => {
        const data = await readFile(fileId);
        const base64 = 'data:' + imageMimeType + ';base64,' + Buffer.from(data, 'binary').toString('base64');

        return base64;
    };

    const readBlob = async (fileId, mimeType) => {
        const data = await readFile(fileId);
        const blob = new Blob([data], { type: mimeType });

        return blob;
    };

    const readFileUrl = async (fileId, imageMimeType) => {
        const blob = await readBlob(fileId, imageMimeType);
        const url = URL.createObjectURL(blob);

        return url;
    };

    const exportFile = async (fileId, exportMimeType) => {
        const file = await gapi.client.drive.files.export({
            fileId,
            mimeType: exportMimeType,
            supportsAllDrives: true
        });

        return file.body;
    };

    const deleteFileOrFolder = async (fileOrFolderId) => {
        const response = await gapi.client.drive.files.delete({
            fileId: fileOrFolderId,
            supportsAllDrives: true
        });

        return response.body === '';
    };

    const _list = async (parentId, pageSize = 1000, pageToken = null, fields = 'nextPageToken, files') => {
        let response = await gapi.client.drive.files.get({
            fileId: parentId,
            fields: 'parents, name'
        });
        let res = JSON.parse(response.body);
        const parentName = res.name;
        const parentParentId = res.parents ? res.parents[0] : folders.rootId;

        let options = {
            pageSize,
            fields,
            supportsAllDrives: true,
            q: `'${parentId}' in parents and trashed = false`,
            orderBy: 'folder, name'
        };
        if (pageToken !== null) options = { ...options, pageToken };

        response = await gapi.client.drive.files.list(options);
        res = JSON.parse(response.body);

        const files = res.files.map((f) => {
            let ret = {
                ...f,
                humanFileSize: f.size ? humanFileSize(f.size, true, 2) : null,
                isDir: (f.mimeType === 'application/vnd.google-apps.folder' || (f.mimeType === 'application/vnd.google-apps.shortcut' && f.shortcutDetails.targetMimeType === 'application/vnd.google-apps.folder')),
                isShortcut: (f.mimeType === 'application/vnd.google-apps.shortcut')
            }
            if (ret.isShortcut) ret = { ...ret, id: f.shortcutDetails.targetId }

            return ret;
        });

        return {
            ...res,
            id: parentId,
            parentId: parentParentId,
            name: parentName,
            files
        };
    };

    const list = async (parentId, pageSize = 1000, pageToken = null) => {
        return await _list(
            parentId,
            pageSize,
            pageToken,
            'nextPageToken, files(id, name, createdTime, modifiedTime, size, mimeType, parents, shortcutDetails, fileExtension)'
        );
    };

    const listFolders = async (parentId, pageSize = 1000, pageToken = null) => {
        const result = await _list(
            parentId,
            pageSize,
            pageToken,
            'nextPageToken, files(id, name, createdTime, modifiedTime, mimeType, parents, shortcutDetails)'
        );

        const files = result.files.filter((f) =>
            f.mimeType === 'application/vnd.google-apps.folder' || (f.mimeType === 'application/vnd.google-apps.shortcut' && f.shortcutDetails.targetMimeType === 'application/vnd.google-apps.folder'),
        );

        return { ...result, files };
    };

    const listFiles = async (parentId, pageSize = 10, pageToken = null) => {
        const result = await _list(
            parentId,
            pageSize,
            pageToken,
            'nextPageToken, files(id, name, createdTime, modifiedTime, size, mimeType, parents, shortcutDetails, fileExtension)'
        );

        const files = result.files.filter((f) =>
            f.size && !(f.mimeType === 'application/vnd.google-apps.folder' || (f.mimeType === 'application/vnd.google-apps.shortcut' && f.shortcutDetails.targetMimeType === 'application/vnd.google-apps.folder')),
        );

        return { ...result, files };
    };



    useEffect(() => {
        if (debug && state.authentificationError !== null) console.error('GDriveProvider', state.authentificationError);
    }, [state.authentificationError]);

    useEffect(() => {
        let localLoaded = false;

        gapi.load('client:auth2', () => {
            if (!localLoaded) {
                setLoading(true);

                if (debug) console.log('GDriveProvider', 'Google API loading');

                gapi.client
                    .init({
                        apiKey,
                        clientId,
                        discoveryDocs: [discoveryRestAPI],
                        scope: expectedScopes,
                    })
                    .then(
                        () => {
                            if (!localLoaded) {
                                if (debug) console.log('GDriveProvider', 'Google API initialized');

                                gapi.auth2.getAuthInstance().isSignedIn.listen(updateSigninStatus);
                                gapi.auth2.getAuthInstance().currentUser.listen(updateGrantedScopes);

                                updateSigninStatus(gapi.auth2.getAuthInstance().isSignedIn.get());
                            }
                        },
                        (error) => setStateError(error)
                    );
            }
        });

        return () => { localLoaded = true }
    }, []);



    return <GDriveContext.Provider value={{
        state,                  // { authentificationError: null|error, isAuthentificated: true|false, user: null|json, profile: null|json }
        loading,                // true|false
        folders,                // { rootId, appId }
        signIn,                 // Sign in to Google
        signOut,                // Sign out from Google
        getRootFolderID,        // ID of Root folder. (force = false): root folder id
        getAppFolderId,         // ID of application folder. (parentFolderId, force = false): app folder id
        createFolder,           // Create new folder. (name, parentId): folder id
        folderExists,           // Folder exists or not. (name, parentId): folder id or false if not exists
        fileExists,             // File exists or not. (filename, parentId): file id or false if not exists
        writeBlob,              // Write blob object to file. Create if not exists. (filename, parentId, blob, mimeType): file id
        writeText,              // Write text to file. Create if not exists. (filename, parentId, text): file id
        writeJson,              // Write JSON to file. Create if not exists. (filename, parentId, json): file id
        readFile,               // Read file. Return binary data. (fileId): binary data
        readBlob,               // Read file. Return blob object. (fileId, mimeType): blob object
        readFileUrl,            // Read file. Return blob url. (fileId, imageMimeType): file url
        readImageToBase64,      // Read file. Return base64 image. (fileId, imageMimeType): base64 image data
        exportFile,             // Export file content to mimetype. (fileId, exportMimeType): converted file
        deleteFileOrFolder,     // Delete file or folder. (fileOrFolderId): true|false
        list,                   // List all file in a folder. (parentId, pageSize = 1000, pageToken = null): { nextPageToken, id, parentId, name, files }
        listFolders,            // List all folders in a parent folder. (parentId, pageSize = 1000, pageToken = null): { nextPageToken, id, parentId, name, files }
        listFiles               // List all files in a parent folder. (parentId, pageSize = 1000, pageToken = null): { nextPageToken, id, parentId, name, files }
    }}>
        {props.children}
    </GDriveContext.Provider>;
}

/**
 * Google Sign in button
 * @param {*} text Label of the button
 * @returns 
 */
export function GoogleSignInButton({ text = 'Sign in with Google' }) {
    const G = useContext(GDriveContext);

    return <button
        onClick={() => G.signIn()}
        disabled={G.loading}
        style={{
            display: 'inline-flex',
            flexDirection: 'row',
            justifyContent: 'center',
            alignItems: 'center',
            columnGap: '0.5em',
            background: 'white',
            color: G.loading ? '#ccc' : '#444',
            borderRadius: '3px',
            border: G.loading ? 'thin solid lightgray' : 'thin solid #888',
            whiteSpace: 'nowrap',
            cursor: G.loading ? 'default' : 'pointer',
            paddingInline: '1em',
            paddingBlock: '0.35em',
            fontSize: 'smaller',
            fontWeight: 'bold',
            fontFamily: '"Roboto", sans-serif',
            height: '36px'
        }}
    >
        {GoogleLogo(24, 24)}
        <span>{text}</span>
    </button >
}

/**
 * Google Sign out button
 * @param {*} text Label of the button
 * @returns 
 */
export function GoogleSignOutButton({ text = 'Sign out' }) {
    const G = useContext(GDriveContext);

    return <button
        onClick={() => G.signOut()}
        disabled={G.loading}
        style={{
            display: 'inline-flex',
            flexDirection: 'row',
            justifyContent: 'center',
            alignItems: 'center',
            columnGap: '0.5em',
            background: 'white',
            color: G.loading ? '#ccc' : '#444',
            borderRadius: '3px',
            border: G.loading ? 'thin solid lightgray' : 'thin solid #888',
            whiteSpace: 'nowrap',
            cursor: G.loading ? 'default' : 'pointer',
            paddingInline: '1em',
            paddingBlock: '0.35em',
            fontSize: 'smaller',
            fontWeight: 'normal',
            fontFamily: '"Roboto", sans-serif',
            height: '36px'
        }}
    >
        <span>{text}</span>
    </button >
}
