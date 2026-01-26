import React, { useState, useRef, useEffect } from 'react';
import toast from 'react-hot-toast';
import ACTIONS from '../Actions';
import Client from '../components/Client';
import Editor from '../components/Editor';
import OutputPanel from '../components/OutputPanel';
import { initSocket } from '../socket';
import {
    fetchOneCompilerLanguages,
    runOneCompiler,
} from '../utils/onecompiler';
import { guessSupportFromOneCompilerLanguage } from '../utils/languageSupport';
import {
    useLocation,
    useNavigate,
    Navigate,
    useParams,
} from 'react-router-dom';

const EditorPage = () => {
    const socketRef = useRef(null);
    const codeRef = useRef(null);
    const editorInstanceRef = useRef(null);
    const lastAutoTemplateRef = useRef('');
    const location = useLocation();
    const { roomId } = useParams();
    const reactNavigator = useNavigate();
    const [clients, setClients] = useState([]);

    const [languages, setLanguages] = useState([]);
    const [languagesLoading, setLanguagesLoading] = useState(true);
    const [selectedLanguage, setSelectedLanguage] = useState(null);
    const [languageMode, setLanguageMode] = useState({ name: 'javascript', json: true });

    const [stdin, setStdin] = useState('');
    const [outputOpen, setOutputOpen] = useState(true);
    const [exec, setExec] = useState({ phase: 'idle', result: null, error: null });

    useEffect(() => {
        const init = async () => {
            socketRef.current = await initSocket();
            socketRef.current.on('connect_error', (err) => handleErrors(err));
            socketRef.current.on('connect_failed', (err) => handleErrors(err));

            function handleErrors(e) {
                console.log('socket error', e);
                toast.error('Socket connection failed, try again later.');
                reactNavigator('/');
            }

            socketRef.current.emit(ACTIONS.JOIN, {
                roomId,
                username: location.state?.username,
            });

            // Listening for joined event
            socketRef.current.on(
                ACTIONS.JOINED,
                ({ clients, username, socketId }) => {
                    if (username !== location.state?.username) {
                        toast.success(`${username} joined the room.`);
                        console.log(`${username} joined`);
                    }
                    setClients(clients);
                    socketRef.current.emit(ACTIONS.SYNC_CODE, {
                        code: codeRef.current,
                        socketId,
                    });
                }
            );

            // Listening for disconnected
            socketRef.current.on(
                ACTIONS.DISCONNECTED,
                ({ socketId, username }) => {
                    toast.success(`${username} left the room.`);
                    setClients((prev) => {
                        return prev.filter(
                            (client) => client.socketId !== socketId
                        );
                    });
                }
            );
        };
        init();
        return () => {
            socketRef.current.disconnect();
            socketRef.current.off(ACTIONS.JOINED);
            socketRef.current.off(ACTIONS.DISCONNECTED);
        };
    }, []);

    useEffect(() => {
        const controller = new AbortController();
        (async () => {
            try {
                setLanguagesLoading(true);
                const list = await fetchOneCompilerLanguages(controller.signal);
                setLanguages(Array.isArray(list) ? list : []);

                const defaultLang =
                    (Array.isArray(list) &&
                        list.find((l) => String(l?.id || '').toLowerCase() === 'javascript')) ||
                    (Array.isArray(list) &&
                        list.find((l) => String(l?.id || '').toLowerCase() === 'python')) ||
                    (Array.isArray(list) ? list[0] : null);

                if (defaultLang) setSelectedLanguage(defaultLang);
            } catch (e) {
                toast.error('Could not load languages (OneCompiler)');
                console.error(e);
            } finally {
                setLanguagesLoading(false);
            }
        })();
        return () => controller.abort();
    }, []);

    useEffect(() => {
        if (!selectedLanguage) return;
        const support = guessSupportFromOneCompilerLanguage(selectedLanguage);
        setLanguageMode(support.mode);

        const currentCode = editorInstanceRef.current?.getValue?.() ?? codeRef.current ?? '';
        const canReplaceBecauseItWasAutoInserted =
            currentCode === lastAutoTemplateRef.current && Boolean(lastAutoTemplateRef.current);

        if ((!currentCode?.trim() || canReplaceBecauseItWasAutoInserted) && support.template) {
            // Insert template if editor is empty OR if it still contains the last auto-inserted template.
            editorInstanceRef.current?.setValue?.(support.template);
            codeRef.current = support.template;
            lastAutoTemplateRef.current = support.template;
        }
    }, [selectedLanguage]);

    async function copyRoomId() {
        try {
            await navigator.clipboard.writeText(roomId);
            toast.success('Room ID has been copied to your clipboard');
        } catch (err) {
            toast.error('Could not copy the Room ID');
            console.error(err);
        }
    }

    function leaveRoom() {
        reactNavigator('/');
    }

    if (!location.state) {
        return <Navigate to="/" />;
    }

    const isRunning = exec.phase === 'running';

    const clearExecution = () => {
        setExec({ phase: 'idle', result: null, error: null });
    };

    const cancelExecution = () => {
        // OneCompiler /run is synchronous; we can only update UI to "cancelled".
        setExec((prev) => ({ ...prev, phase: 'cancelled' }));
    };

    const runCode = async () => {
        if (!selectedLanguage?.id) {
            toast.error('Select a language first');
            return;
        }

        const code = editorInstanceRef.current?.getValue?.() ?? codeRef.current ?? '';
        if (!code.trim()) {
            toast.error('Write some code first');
            return;
        }

        setOutputOpen(true);

        try {
            setExec({ phase: 'running', result: null, error: null });
            const r = await runOneCompiler({
                language: selectedLanguage.id,
                code,
                stdin,
            });
            setExec({ phase: 'done', result: r, error: null });
        } catch (e) {
            console.error(e);
            setExec({ phase: 'error', result: null, error: String(e?.message || e) });
            toast.error('Execution failed');
        }
    };

    return (
        <div className="mainWrap">
            <div className="aside">
                <div className="asideInner">
                    <div className="logo">
                        <img
                            className="logoImage"
                            src="/Codify.png"
                            alt="logo"
                        />
                    </div>
                    <h3>Connected</h3>
                    <div className="clientsList">
                        {clients.map((client) => (
                            <Client
                                key={client.socketId}
                                username={client.username}
                            />
                        ))}
                    </div>
                </div>
                <button className="btn copyBtn" onClick={copyRoomId}>
                    Copy ROOM ID
                </button>
                <button className="btn leaveBtn" onClick={leaveRoom}>
                    Leave
                </button>
            </div>
            <div className="editorWrap">
                <div className="editorTopBar">
                    <div className="editorTopBarSide">
                        <div className="topBarLabel">Language</div>
                        <select
                            className="languageSelect"
                            value={selectedLanguage?.id || ''}
                            onChange={(e) => {
                                const id = e.target.value;
                                const lang = languages.find((l) => String(l.id) === String(id));
                                setSelectedLanguage(lang || null);
                            }}
                            disabled={languagesLoading || isRunning}
                        >
                            {languagesLoading ? (
                                <option value="">Loading...</option>
                            ) : (
                                <>
                                    <option value="" disabled>
                                        Select language…
                                    </option>
                                    {languages.map((l) => (
                                        <option key={l.id} value={l.id}>
                                            {l.name}
                                        </option>
                                    ))}
                                </>
                            )}
                        </select>
                    </div>

                    <div className="editorTopBarCenter">
                        <button className="btn runBtn" onClick={runCode} disabled={languagesLoading || isRunning}>
                            {isRunning ? 'Running…' : 'Run'}
                        </button>
                    </div>

                    <div className="editorTopBarSide right">
                        <button className="btn" onClick={() => setOutputOpen((v) => !v)}>
                            {outputOpen ? 'Hide Output' : 'Show Output'}
                        </button>
                    </div>
                </div>

                <div className="editorArea">
                    <Editor
                        socketRef={socketRef}
                        roomId={roomId}
                        languageMode={languageMode}
                        onCodeChange={(code) => {
                            codeRef.current = code;
                        }}
                        onEditorReady={(cm) => {
                            editorInstanceRef.current = cm;
                        }}
                    />
                </div>

                <OutputPanel
                    isOpen={outputOpen}
                    onToggle={() => setOutputOpen((v) => !v)}
                    exec={exec}
                    stdin={stdin}
                    setStdin={setStdin}
                    onCancel={cancelExecution}
                    onClear={clearExecution}
                />
            </div>
        </div>
    );
};

export default EditorPage;
