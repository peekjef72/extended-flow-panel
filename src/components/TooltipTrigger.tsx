import React, { forwardRef, useEffect, useImperativeHandle, useLayoutEffect, useRef, useState } from 'react';
// import { Popover, Tooltip } from '@grafana/ui';
import { Popover } from '@grafana/ui';
import { Placement } from '@popperjs/core';

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
  w: number;
  h: number;
  elementId: string;
  placement: Placement;
  
}

export interface TooltipTriggerProps {
    content: React.JSX.Element | string | undefined;
    config: TooltipTriggerConfig | undefined;
    state: string | undefined;

    registerSetterSetTooltipContent: (
        setter: React.Dispatch<React.SetStateAction<React.JSX.Element | string>>
    ) => void;

    registerSetterSetTooltipState: (
        setter: React.Dispatch<React.SetStateAction<string>>
    ) => void;

    registerSetterSetTooltipConfig: (
        setter: React.Dispatch<React.SetStateAction<TooltipTriggerConfig>>
    ) => void;
    onRefsChange?: ( refs: {
        content: React.JSX.Element | string;
        config: TooltipTriggerConfig;
    }) => void;
}

export type TooltipTriggerHandle = {
    getTooltipContentRef: () => React.JSX.Element | string;
    getTooltipConfigRef: () => TooltipTriggerConfig;
}

export const TooltipTrigger = forwardRef<TooltipTriggerHandle, TooltipTriggerProps>((props, ref) => {
    const [tooltipContent, setTooltipContent] = useState<React.JSX.Element | string>(props.content || 'Default Value');
    const [tooltipState, setTooltipState] = useState<string>(props.state || 'none');
    const [tooltipConfig, setTooltipConfig ] = useState<TooltipTriggerConfig>({ x: 0, y: 0, w: 0, h: 0, elementId: '', placement: 'auto'});

    const [open, setOpen] = useState(false);
    // const svgRef = useRef<SVGRectElement>(null);

    const mouseOutTooltipTriggerHandlerRef = useRef<any>(null);
    // const tooltipTriggerRef = useRef<string>(`tooltip-trigger#${Math.random().toString(36)}`);
    const tooltipContentRef = useRef<string | React.JSX.Element>('Default Value');
    const tooltipConfigRef = useRef<TooltipTriggerConfig>({
        x: 0,
        y: 0,
        w: 0,
        h: 0,
        elementId: '',
        placement: 'bottom',
    });

    function tooltipTriggerHandlerFactory() {
        return (event: React.MouseEvent<HTMLElement, MouseEvent>) => {
            if (event.target) {
                if(event.type === 'mouseout') {
                    setTooltipState('none');
                // } else {
                }
            }
        }
    }

    mouseOutTooltipTriggerHandlerRef.current = tooltipTriggerHandlerFactory()

    // Expose setters to parent
    const registerSetterSetTooltipContent = props.registerSetterSetTooltipContent;
    useEffect( () => {
        registerSetterSetTooltipContent( setTooltipContent );
    }, [registerSetterSetTooltipContent] );

    const registerSetterSetTooltipState = props.registerSetterSetTooltipState;
    useEffect( () => {
        registerSetterSetTooltipState( setTooltipState );
    }, [registerSetterSetTooltipState] );

    const registerSetterSetTooltipConfig = props.registerSetterSetTooltipConfig;
    useEffect( () => {
        registerSetterSetTooltipConfig( setTooltipConfig );
    }, [registerSetterSetTooltipConfig] );

    // set config and content ref
    tooltipContentRef.current =
        typeof tooltipContent === 'object'
            ? tooltipContent.props?.dangerouslySetInnerHTML?.__html ?? ''
            : tooltipContent;

    tooltipConfigRef.current = tooltipConfig;

    useImperativeHandle(ref, () => ({
        getTooltipContentRef() {
            return tooltipContentRef?.current;
        },
        getTooltipConfigRef() {
            return tooltipConfigRef?.current;
        },
    }))
    //---------------------------------------------------------------------------
    // maintain refs from object
    useLayoutEffect(() => {
        props.onRefsChange?.({
            content: tooltipContentRef.current,
            config: tooltipConfigRef.current,
        });
    }, [tooltipContent, tooltipConfig]);




    // useEffect(() => {
    //     if (!svgRef.current) return;

    //     const observer = observeClassChange(
    //         svgRef.current as any,
    //         "highlighted",
    //         () => {
    //             const rect = svgRef.current!.getBoundingClientRect();
    //       setTooltipConfig({ 
    //         x: rect.x,
    //         y: rect.y,
    //         w: rect.width /* * scale*/,
    //         h: rect.height /* * scale*/,
    //         elementId: '',
    //         placement: 'top',
    //       });
    //                     //   setPosition({ x: rect.x + rect.width / 2, y: rect.y });
    //             setOpen(true);
    //         },
    //         () => setOpen(false)
    //     );

    //     return () => observer.disconnect();
    // }, []);

    useEffect( () => {
        if ( tooltipState === '') {
            setOpen(true)
        } else {
            setOpen(false)
        }
    }, [tooltipState]);
    //------

    if (typeof tooltipContent !== "string") {
        return (
            // <Tooltip content={tooltipContent} placement={tooltipConfig.placement}>
            //     <div
            //         style={{
            //             position: 'absolute',
            //             top: tooltipConfig.y,
            //             left: tooltipConfig.x,
            //             width: tooltipConfig.w,
            //             height: tooltipConfig.h,
            //             pointerEvents: 'auto',
            //             display: tooltipState,
            //         }}
            //         onMouseOut={mouseOutTooltipTriggerHandlerRef.current}
            //         onMouseEnter={mouseOutTooltipTriggerHandlerRef.current}
                    
            //     />
            // </Tooltip>
            <Popover
                show={open}
                placement={tooltipConfig.placement}
                referenceElement={{
                    getBoundingClientRect: () => new DOMRect(tooltipConfig.x, tooltipConfig.y, 0, 0),
                }}
                content={tooltipContent}

            />
        )
    } else {
        let dummy = <div></div>
        return ( open && dummy );
    }
});

TooltipTrigger.displayName = 'TooltipTrigger';
