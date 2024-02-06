import React, { useContext, useEffect } from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';

import GDriveProvider, { GDriveContext } from './GDriveProvider';
import GDJsonDatabaseProvider, { GDJsonDatabaseContext } from './GDJsonDatabaseProvider';

export function App() {
    return <GDriveProvider
        debug={true}
        apiKey={process.env.GOOGLE_DRIVE_API_KEY}
        clientId={process.env.GOOGLE_CLIENT_ID}
        appFolderName={process.env.APP_NAME}
        useAppFolder={true}
    >
        <GDJsonDatabase
            database='db'
        >
            <BrowserRouter>
                <Routes>
                    <Route element={<Auth page={Home} />} path='/' exact />
                    <Route element={<Login />} path='/login' exact />
                    <Route element={<Auth page={Home} />} path='*' />
                </Routes>
            </BrowserRouter>
        </GDJsonDatabase>
    </GDriveProvider>;
}

function Auth(props) {
    const Page = props.page;
    const G = useContext(GDriveContext);

    if (G.state.isAuthentificated) {
        return <Page />;
    } else {
        return <Login />
    }
}

function GDJsonDatabase(props) {
    const G = useContext(GDriveContext);

    return <GDJsonDatabaseProvider
        folderId={G.folders.appId}
        {...props}
    >
        {props.children}
    </GDJsonDatabaseProvider>;
}

function Home() {
    const G = useContext(GDriveContext);
    const DB = useContext(GDJsonDatabaseContext);

    useEffect(() => {
        if (DB.loaded) {
            import('./db.json')
                .then((json) => DB.set(json))
                .catch((error) => console.error(error));
        }
    }, [DB.loaded]);

    return <>
        <h1>Home Page</h1>

        <pre>{JSON.stringify(DB.get())}</pre>
        <button onClick={() => DB.table('bob').find((row) => row.id > 0).delete()}>Delete</button>&nbsp;&nbsp;&nbsp;
        <button onClick={() => DB.table('bob').find((row) => row.id === 0).update({ name: "SuperMan" })}>Update</button>&nbsp;&nbsp;&nbsp;
        <button onClick={() => DB.table('bob').insert({ name: "Batman" })}>Insert</button>&nbsp;&nbsp;&nbsp;
      
        <GoogleSignOutButton text="Disconect" />
    </>;
}

function Login() {
    const G = useContext(GDriveContext);

    return <>
        <h1>Login Page</h1>
        <GoogleSignInButton text="Sign in with Google" />
    </>;
}
