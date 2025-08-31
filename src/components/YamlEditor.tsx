import { css } from '@emotion/css';
import React from 'react';

import { GrafanaTheme2 } from '@grafana/data';
import { CodeEditor, useStyles2 } from '@grafana/ui';

export const YamlEditor = (props: any) => {
  const styles = useStyles2(getStyles);
<<<<<<< HEAD
  let resizeObs: any
=======
  let resizeObs: any, global_editor: any

>>>>>>> 833c791 (yaml_editor)

  function handleEditorDidMount(editor: any, monaco: any) {
    editor._domElement.style.overflow='auto'
    editor._domElement.style.resize='vertical'
    editor.updateOptions({'fontSize': 12})
    resizeObs = new ResizeObserver( entries => {
      editor.getDomNode().parentNode.parentNode.parentNode.style.height = editor.getDomNode().clientHeight + 2 + 'px'
    })
<<<<<<< HEAD
=======
    global_editor = editor
>>>>>>> 833c791 (yaml_editor)
    resizeObs.observe(editor._domElement)
  }

  return (
    <div>
      <CodeEditor
        value={`${props.value}`}
        language='yaml'
        height={100}
        onEditorDidMount={handleEditorDidMount}
        containerStyles={styles.codeEditorContainer}
        showMiniMap={false}
        showLineNumbers={false}
        readOnly={false}
<<<<<<< HEAD
        onBlur={props.onChange}
=======
        onChange={props.onChange}
>>>>>>> 833c791 (yaml_editor)
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
  });
