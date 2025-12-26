import { css, cx } from '@emotion/css';
import React, { useRef, useState } from 'react';

import { GrafanaTheme2 } from '@grafana/data';
import { CodeEditor, Button, useStyles2 } from '@grafana/ui';
import { preLoadYaml } from './Loader';
import YAML from 'yaml';

type setErrorMarkerType = {startLine: number, startCol: number, endLine: number, endCol: number }

export const YamlEditor = (props: any) => {
    const [statusMsg, setStatusMsg] = useState('');
    const editorRef = useRef<any | null>(null);
    const errorMarkerRef = useRef<setErrorMarkerType | null>(null);
    const errorMsgRef = useRef<HTMLLabelElement | null >(null);
    const errorMsgMaxWidthRef = useRef<number>(200);
    const styles = useStyles2(getStyles);
    let resizeObs: any
    
    function handleEditorDidMount(editor: any, monaco: any) {
        editorRef.current = editor;
        editor._domElement.style.overflow='auto';
        editor._domElement.style.resize='vertical';
        editor.updateOptions({'fontSize': 12});
        resizeObs = new ResizeObserver( entries => {
            const element = editor.getDomNode();
            if (element && element.parentNode && element.parentNode.parentNode && element.parentNode.parentNode.parentNode) {
                element.parentNode.parentNode.parentNode.style.height = element.clientHeight + 2 + 'px'
                // console.log("YamlEditor resize width =", element.clientWidth + 'px');
                if (errorMsgRef.current) {
                    errorMsgRef.current.style.maxWidth = (element.clientWidth - 25) + 'px';
                }
                errorMsgMaxWidthRef.current = element.clientWidth - 25;
            }
        })
        resizeObs.observe(editor._domElement);
    }

    function setErrorMarker(message: string) {
        const editor = editorRef.current;
        if (!editor) {
            return;
        }
        const errorMarker = errorMarkerRef.current;
        if (!errorMarker) {
            return;
        }
        const model = editor.getModel();
        if (!model) {
            return;
        }
        editor.setSelection({
            startLineNumber: errorMarker.startLine,
            startColumn: errorMarker.startCol,
            endLineNumber: errorMarker.endLine,
            endColumn: errorMarker.endCol,
        })
        
        editor.revealLineInCenter(errorMarker.startLine);
        editor.focus();
        setStatusMsg(message);
    }

    function onChange(value: string | undefined) {
        if (value === undefined) {
            setStatusMsg('');
        } else {
            const error = preLoadYaml(value);
            if (error instanceof YAML.YAMLParseError ) {
                let endLine = 1;
                let endCol = 1;
                const startLine = error.linePos && error.linePos.length > 0 ? error.linePos[0].line : 1;
                const startCol = error.linePos && error.linePos.length > 0 ? error.linePos[0].col : 1;
                if( error.linePos && error.linePos.length > 1 ) {
                    endLine = error.linePos[1]?.line ?? startLine;
                    endCol = error.linePos[1]?.col ?? startCol + 1;
                } else {
                    endLine = startLine;
                    endCol = startCol + 1;
                }
                errorMarkerRef.current = {startLine: startLine, startCol: startCol, endLine: endLine, endCol: endCol};
                setStatusMsg(error.message);
//                setErrorMarker(startLine, startCol, endLine, endCol, error.message);
            } else {
                errorMarkerRef.current = {startLine: 1, startCol: 1, endLine: 1, endCol: 1};
                setStatusMsg('');
            }
            // console.log("YamlEditor preLoadYaml error =", error);
        }
        props.onChange(value);
        return;
    }

    const errorMsgMaxWidth = errorMsgMaxWidthRef.current ?? 200;
    const errorElement = statusMsg !== '' ?<div title={statusMsg}>
            <Button
                icon="exclamation-triangle"
                variant="destructive"
                size="sm"
                onClick={ () => setErrorMarker(statusMsg)}
                aria-label="Warning"/>
            <label ref={errorMsgRef} className={cx(styles.errorMsg)} style={{maxWidth: `${errorMsgMaxWidth}px`}}>{statusMsg}</label>
        </div> : undefined

    return (
        
        <div>
            {errorElement}
            <CodeEditor
                value={`${props.value}`}
                language='yaml'
                height={100}
                onEditorDidMount={handleEditorDidMount}
                containerStyles={styles.codeEditorContainer}
                showMiniMap={false}
                showLineNumbers={false}
                readOnly={false}
                onBlur={onChange}
                // onBlur={props.onChange}
                monacoOptions={{ 
                    automaticLayout: true
                }}
            />
            </div>
        );
    };
    
    const getStyles = (theme: GrafanaTheme2) => ({
        codeEditorContainer: css({
            // resize: 'vertical',
            overflow: 'unset',
            borderRadius: '2px;',
            border: '1px solid rgba(204, 204, 220, 0.2)',
        }),
        errorMsg: css({
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            fontSize: '12px',
            verticalAlign: 'bottom',
        })
    });
