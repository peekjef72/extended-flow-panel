import React, { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
// import { Popover, Tooltip } from '@grafana/ui';
import { GrafanaTheme2} from '@grafana/data';
import { Popover, useStyles2 } from '@grafana/ui';
import { css } from '@emotion/css';

// function observeClassChange(
//   element: HTMLElement,
//   className: string,
//   onActivate: () => void,
//   onDeactivate?: () => void
// ) {
//   const observer = new MutationObserver((mutations) => {
//     for (const mutation of mutations) {
//       if (mutation.type === "attributes" && mutation.attributeName === "class") {
//         const isActive = element.classList.contains(className);
//         if (isActive) {
//           onActivate();
//         } else {
//           onDeactivate?.();
//         }
//       }
//     }
//   });

//   observer.observe(element, { attributes: true });
//   return observer;
// }

export type TooltipTriggerConfig = {
  x: number;
  y: number;
}

type TooltipTriggerInternalConfig = TooltipTriggerConfig & {
  container: { width: number, height: number};
  overlayRect: DOMRect;
}

function getPosition(config: TooltipTriggerInternalConfig) {
    const mouseX = config.x, mouseY = config.y;
    let left = (mouseX - config.overlayRect.x) ;
    let top = mouseY - ( config.container.height / 2 );
    let vPos = 'middle', hPos='right';
    const paddingLeft = 20, paddingTop = 20;
    
    if (top < config.overlayRect.top ) { vPos='top'}
    if ( mouseY + config.container.height + paddingTop > config.overlayRect.bottom ) { vPos= 'bottom' }
    if ( left < 0 ) { hPos = 'right'; }
    else if (mouseX + config.container.width + paddingLeft > config.overlayRect.right ) { hPos='left'; }

    // if ( vPos === 'top' ) {
    switch ( vPos ) {
        case 'top':
            top = mouseY + paddingTop ;
            break;
        case 'bottom':
            top = mouseY - ( config.container.height + paddingTop );
            break;
        case 'middle':
            // this is the default value... to set again.
            // top = mouseY - ( config.container.height / 2 );
            break;
    }

    switch(hPos) {
        case 'left':
            left = mouseX - ( config.container.width + paddingLeft );
            break;
        case 'right':
            left = mouseX + paddingLeft;
            break;
    }

    return [left, top];
}

export interface TooltipTriggerProps {
    content: React.JSX.Element | string | undefined;
    config: TooltipTriggerConfig | null;
    open: boolean | undefined;

    registerSetterSetTooltipContent: (
        setter: React.Dispatch<React.SetStateAction<React.JSX.Element | string>>
    ) => void;

    registerSetterSetTooltipOpen: (
        setter: React.Dispatch<React.SetStateAction<boolean>>
    ) => void;

    registerSetterSetTooltipConfig: (
        setter: React.Dispatch<React.SetStateAction<TooltipTriggerConfig>>
    ) => void;
    // onRefsChange?: ( refs: {
    //     content: React.JSX.Element | string;
    //     config: TooltipTriggerConfig;
    // }) => void;
}

export type TooltipTriggerHandle = {
    // setContainerDim: (w: number, h: number) => void;
    setOverlayRect: (rect: DOMRect) => void;
    setMousePosition: ( mouseX: number, mouseY: number) => void,
    getTooltipContentRef: () => React.JSX.Element | string;
    // getTooltipConfigRef: () => TooltipTriggerConfig;
}

export const TooltipTrigger = forwardRef<TooltipTriggerHandle, TooltipTriggerProps>((props, ref) => {
    const [tooltipContent, setTooltipContent] = useState<React.JSX.Element | string>(props.content || 'Default Value');
    const [tooltipOpen, setTooltipOpen] = useState<boolean>(props.open || false);
    const [tooltipConfig, setTooltipConfig ] = useState<TooltipTriggerConfig>(props.config || {
        x: 0,
        y: 0,
    });


    const tooltipContentRef = useRef<string | React.JSX.Element>('Default Value');
    const tooltipConfigRef = useRef<TooltipTriggerInternalConfig>({ 
            x: props.config?.x || 0, 
            y: props.config?.y || 0,
            container: { width: 0, height: 0},
            overlayRect: new DOMRect(0, 0, 0, 0),
        });

  const tooltipContainerRef = useRef<HTMLDivElement | null>(null);

    // Expose setters to parent
    const registerSetterSetTooltipContent = props.registerSetterSetTooltipContent;
    useEffect( () => {
        registerSetterSetTooltipContent( setTooltipContent );
    }, [registerSetterSetTooltipContent] );

    const registerSetterSetTooltipOpen = props.registerSetterSetTooltipOpen;
    useEffect( () => {
        registerSetterSetTooltipOpen( setTooltipOpen );
    }, [registerSetterSetTooltipOpen] );

    const registerSetterSetTooltipConfig = props.registerSetterSetTooltipConfig;
    useEffect( () => {
        registerSetterSetTooltipConfig( setTooltipConfig );
    }, [registerSetterSetTooltipConfig] );

    // set config and content ref
    tooltipContentRef.current =
        typeof tooltipContent === 'object'
            ? tooltipContent.props?.dangerouslySetInnerHTML?.__html ?? ''
            : tooltipContent;

    // tooltipConfigRef.current = tooltipConfig;

    useImperativeHandle(ref, () => ({

        setOverlayRect(rect: DOMRect) {
            if (tooltipConfigRef.current) {
                tooltipConfigRef.current.overlayRect = rect;
                // console.log('TooltipTrigger()/setOverlayRect: rect', rect);
            }
        },
        setMousePosition( mouseX: number, mouseY: number) {
            if (tooltipConfigRef.current) {
                tooltipConfigRef.current.x = mouseX;
                tooltipConfigRef.current.y = mouseY;
                // console.log('TooltipTrigger()/setMousePosition(): (x,y)', [mouseX, mouseY]);
                const [left, top] = getPosition(tooltipConfigRef.current);
                const config:TooltipTriggerConfig = { 
                    x: left,
                    y: top,
                }
                setTooltipConfig(config)
                setTooltipOpen(true);
            }

        },
        getTooltipContentRef() {
            return tooltipContentRef?.current;
        },
        // getTooltipConfigRef() {
        //     return tooltipConfigRef?.current;
        // },
    }));

    useEffect( () => {
        if (!tooltipConfigRef.current) {
            return;
        }
        tooltipConfigRef.current.x = tooltipConfig.x;
        tooltipConfigRef.current.y = tooltipConfig.y;
        // console.log('TooltipTrigger(/useEffect(tooltipConfig)): src tooltipConfig:', tooltipConfig, 'dst tooltipConfigRef', tooltipConfigRef.current)
    }, [tooltipConfig]);

    useEffect( () => {
        if (tooltipOpen && tooltipContainerRef && tooltipContainerRef.current) {

            // console.log('TooltipTrigger.useEffect(/tooltipOpen): setContainerDim candidate:', tooltipContainerRef.current);
            const containerRect = tooltipContainerRef.current.getBoundingClientRect() ?? new DOMRect(0, 0, 0, 0);
            if (tooltipConfigRef.current) {
                tooltipConfigRef.current.container.width = containerRect.width;
                tooltipConfigRef.current.container.height = containerRect.height;
                // console.log('TooltipTrigger.useEffect(/tooltipOpen): setContainerDim (w,h):', [containerRect.width, containerRect.height]);
            }

        }
    }, [tooltipOpen, tooltipContent]);

    //------
    
    const styles = useStyles2(getStyles);

    let content;
    if (typeof tooltipContent !== "string") {
        // console.log("build TooltipTrigger(): tooltipConfig", tooltipConfig)
        content = (
            <div ref={tooltipContainerRef} className={styles.wrapper}>
                {tooltipContent}
            </div>
        );
    } else {
        content = <div className={styles.wrapper}
            dangerouslySetInnerHTML={{__html: tooltipContent}}/>
    }

    return (
        <Popover
            show={tooltipOpen}
            referenceElement={{
                getBoundingClientRect: () => new DOMRect(tooltipConfig.x, tooltipConfig.y, 0, 0),
            }}
            content={content}
        />
    );
});

const getStyles = (theme: GrafanaTheme2) => {
    return {
        wrapper: css({
            background: theme.components.tooltip.background,
            border: `1px solid ${theme.colors.border.weak}`, 
            borderRadius: theme.shape.radius.default,
            boxShadow: theme.shadows.z2,
            fontSize: theme.typography.bodySmall.fontSize,
            left: 0,
            maxWidth: '800px',
            overflow: 'hidden',
            padding: theme.spacing(1),
            position: 'fixed',
            top: 0,
            userSelect: 'text',
            whiteSpace: 'pre',
            zIndex: theme.zIndex.tooltip,
        }),
        tooltipsBox: css`
            padding: 8px;
            background: rgb(24, 27, 31);
            border-width: 1px 1px medium;
            border-style: solid solid none;
            border-color: rgba(204, 204, 220, 0.12) rgba(204, 204, 220, 0.12) currentcolor;
            border-image: none;
            border-top-left-radius: 3px;
        `,
    };
};

TooltipTrigger.displayName = 'TooltipTrigger';
