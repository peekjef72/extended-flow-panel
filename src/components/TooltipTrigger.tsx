import React, { useRef } from 'react';
import { Tooltip } from '@grafana/ui';

export type TooltipTriggerConfig = {
  x: number; y: number; w: number; h: number;
  elementId: string;
}

export interface TooltipTriggerProps {
    setContent: React.Dispatch<React.SetStateAction<string | React.JSX.Element>>;
    content: string | React.JSX.Element;
    setTooltipConfig: React.Dispatch<React.SetStateAction<TooltipTriggerConfig>>;
    config: TooltipTriggerConfig;
    setTooltipState: React.Dispatch<React.SetStateAction<string>>;
    state: string;
}

export const TooltipTrigger = (props: TooltipTriggerProps) => {
    const setTooltipState = props.setTooltipState
    const mouseOutTooltipTriggerHandlerRef = useRef<any>(null)
    const tooltipTriggerRef = useRef<string>(`tooltip-trigger#${Math.random().toString(36)}`)

    function tooltipTriggerHandlerFactory() {
        
        return (event: React.MouseEvent<HTMLElement, MouseEvent>) => {
            if (event.target) {
                setTooltipState('none');
            }
        }
    }

    mouseOutTooltipTriggerHandlerRef.current = tooltipTriggerHandlerFactory()

    return (
        <Tooltip content={props.content}>
            <div
                ref={tooltipTriggerRef.current}
                style={{
                    position: 'absolute',
                    top: props.config.y,
                    left: props.config.x,
                    width: props.config.w,
                    height: props.config.h,
                    pointerEvents: 'auto',
                    display: props.state,
                }}
                // onMouseOver={tooltipTriggerMouseOverHandlerRef.current}
                onMouseOut={mouseOutTooltipTriggerHandlerRef.current}
            />
        </Tooltip>
    )
}
