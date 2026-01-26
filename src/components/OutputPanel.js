import React from 'react';

const statusText = (exec) => {
    if (!exec) return 'Idle';
    if (exec.phase === 'running') return 'Running...';
    if (exec.phase === 'done') return exec.result?.status || 'Done';
    if (exec.phase === 'cancelled') return 'Cancelled';
    if (exec.phase === 'error') return 'Error';
    return 'Idle';
};

export default function OutputPanel({
    isOpen,
    onToggle,
    exec,
    stdin,
    setStdin,
    onCancel,
    onClear,
}) {
    const result = exec?.result;
    const stdout = result?.stdout || '';
    const stderr = result?.stderr || '';
    const exception = result?.exception || '';
    const apiError = result?.error || '';
    const localError = exec?.error || '';

    const hasOutput = Boolean(stdout || stderr || exception || apiError || localError);

    return (
        <div className={`outputPanel ${isOpen ? 'open' : 'closed'}`}>
            <div className="outputPanelHeader">
                <button className="btn outputToggleBtn" onClick={onToggle}>
                    {isOpen ? 'Hide Output' : 'Show Output'}
                </button>
                <div className="outputStatus">
                    <span className={`statusDot ${exec?.phase || 'idle'}`} />
                    <span className="statusText">{statusText(exec)}</span>
                    {result?.executionTime != null || result?.memoryUsed != null ? (
                        <span className="statusMeta">
                            {result?.compilationTime != null ? `Compile: ${result.compilationTime}ms` : ''}
                            {result?.compilationTime != null &&
                            (result?.executionTime != null || result?.memoryUsed != null)
                                ? ' • '
                                : ''}
                            {result?.executionTime != null ? `Exec: ${result.executionTime}ms` : ''}
                            {result?.executionTime != null && result?.memoryUsed != null ? ' • ' : ''}
                            {result?.memoryUsed != null ? `Memory: ${result.memoryUsed} KB` : ''}
                        </span>
                    ) : null}
                </div>
                <div className="outputActions">
                    {exec?.phase === 'running' && (
                        <button className="btn dangerBtn" onClick={onCancel}>
                            Cancel
                        </button>
                    )}
                    <button className="btn" onClick={onClear}>
                        Clear
                    </button>
                </div>
            </div>

            {isOpen && (
                <div className="outputPanelBody">
                    <div className="outputGrid">
                        <div className="outputBlock">
                            <div className="outputBlockTitle">STDIN</div>
                            <textarea
                                className="stdinBox"
                                placeholder="Optional input for your program..."
                                value={stdin}
                                onChange={(e) => setStdin(e.target.value)}
                            />
                        </div>

                        <div className="outputBlock">
                            <div className="outputBlockTitle">OUTPUT</div>
                            <pre className={`terminal ${exec?.phase === 'error' ? 'terminalError' : ''}`}>
                                {hasOutput
                                    ? [
                                          localError ? `# Error\n${localError}\n` : '',
                                          apiError ? `# API Error\n${apiError}\n` : '',
                                          exception ? `# Exception\n${exception}\n` : '',
                                          stderr ? `# STDERR\n${stderr}\n` : '',
                                          stdout ? `# STDOUT\n${stdout}\n` : '',
                                      ].join('')
                                    : exec?.phase === 'running'
                                      ? 'Running...'
                                      : 'No output yet.'}
                            </pre>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}


