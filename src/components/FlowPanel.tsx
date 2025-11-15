import React, { useEffect, useState, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { css, cx } from '@emotion/css';
import { Button, useStyles2, useTheme2 } from '@grafana/ui';
import { getTemplateSrv } from '@grafana/runtime';
import { GrafanaTheme2, PanelProps, toDataFrame } from '@grafana/data';
import { FlowOptions, DebuggingCtrs } from '../types';
import { configInit, panelConfigFactory, PanelConfig, siteConfigFactory, SiteConfig } from 'components/Config';
import { HighlightState, HighlighterFactory, highlighterInitialState } from 'components/Highlighter';
import { loadSvg, loadYaml } from 'components/Loader';
import { svgInit, svgUpdate, SvgHolder, SvgElementAttribs, SvgAttribs } from 'components/SvgUpdater';
import { seriesExtend, seriesInterpolate , seriesTransform } from 'components/TimeSeries';
import { TimeSliderFactory } from 'components/TimeSlider';
import { displayColorsInner, displayDataInner, displayMappingsInner, displaySvgInner } from 'components/DebuggingEditor';
import { colorLookup, constructUrl, flowDebug, getInstrumenter } from 'components/Utils';
import { TooltipTrigger, TooltipTriggerHandle, TooltipTriggerConfig } from "components/TooltipTrigger"
import { addHook, sanitize } from 'dompurify';
import { TransformWrapper, TransformComponent } from 'react-zoom-pan-pinch';

interface Props extends PanelProps<FlowOptions> {}

enum AnimationControlPosition { timeSlider, highlighter, own, none };

//-----------------------------------------------------------------------------
// Sanitize externally defined SVG using DOMPurify. DrawIO svg's rely on
// foreignObject. In addition, the cursor changing to a pointer on mouse-over of
// cells with links, relies on foreignObject defining 'pointer-events: none'. As
// such sanitization is configured to retain these objects and put back the
// pointer-events attribute. Note the parser-media-type matters in particular corners
// such as use of line breaks (<br/> in text blocks, but has the side effect of removing
// the viewBox that has to be put back for correct scaling.
let viewBox: string | null = null;

addHook('uponSanitizeAttribute', function(el) {
  if (el.nodeName === 'svg') {
    viewBox = el.getAttribute('viewBox');
  }
});

addHook('afterSanitizeAttributes', function(el) {
  if (el.nodeName === 'foreignObject') {
    el.setAttribute('pointer-events', 'none');
  }
  if (el.nodeName === 'svg' && viewBox) {
    el.setAttribute('viewBox', viewBox);
  }
});

function sanitizeSvgStr(svgStr: string) {
  return sanitize(svgStr, {
    PARSER_MEDIA_TYPE: 'application/xhtml+xml',
    ADD_TAGS: ['foreignObject', 'linearGradient', 'radialGradient'],
    // dompurify 3.0.8 allows these attribs and the above gradient tags in lowercase but not camelcase.
    // Until fixed in that layer we add these to the allowed list.
    ADD_ATTR: ['viewBox', 'refX', 'refY', 'markerWidth', 'markerHeight', 'markerUnits', 'preserveAspectRatio',
      'gradientUnits', 'gradientTransform'],
  });
}

//-----------------------------------------------------------------------------

const getStyles = () => {
  return {
    wrapper: css`
      font-family: Arial;
      position: relative;
    `,
    svg: css`
      position: absolute;
      top: 0;
      left: 0;
    `,
    textBox: css`
      position: absolute;
      bottom: 0;
      left: 0;
      padding: 10px;
    `,
  };
};

function clickHandlerFactory(elementAttribs: Map<string, SvgElementAttribs>, linkVariables: Map<string, string>) {
  return (event: React.MouseEvent<HTMLElement, MouseEvent>) => {
    if (event.target) {
      const element = event.target as HTMLElement;
      const attribs = elementAttribs.get(element.id);
      const link = attribs?.link;
      if (link) {
        const url = constructUrl(link, attribs, linkVariables, getTemplateSrv());
        if (url) {
          const sameTarget = link.sameTab && !event.ctrlKey && !event.shiftKey;
          window.open(url, (sameTarget ? '_self' : undefined));
        }
      }
    }
  }
}

function tooltipHandlerFactory(
  svgAttribs: SvgAttribs, 
  setTooltipContent: (
      content: React.JSX.Element | string,
    ) => void,
  setTooltipConfig: React.Dispatch<React.SetStateAction<TooltipTriggerConfig>> | null,
  tooltipConfigRef: React.MutableRefObject<TooltipTriggerConfig|null>,
  setTooltipOpen: React.Dispatch<React.SetStateAction<boolean>> | null,
  tooltipTrigger: TooltipTriggerHandle | null,
) {
  let activeElement: HTMLElement | null = null;

  return (event: React.MouseEvent<HTMLElement, MouseEvent>) => {
    if (!tooltipConfigRef || !tooltipConfigRef.current || !setTooltipConfig || !setTooltipOpen) {
      return;
    }
    if (event.target) {
      const tooltipConfig = tooltipConfigRef.current;
      if (event.type === "mousemove") {
         if (!activeElement) {
           return;
         } else {

          tooltipTrigger?.setMousePosition(event.clientX, event.clientY, "unchanged");

          tooltipConfigRef.current.elementId = activeElement.id;
          // console.log('tooltipHandlerFactory(): config:', config)
         }
      } else {
        const element = event.target as HTMLElement;
        const attribs = svgAttribs.elementAttribs.get(element.id);
        if (!attribs) {
          return;
        }
        // console.log("tooltipHandlerFactory(): tooltipConfig:", tooltipConfig, " - tooltipContent:", tooltipContentRef.current)
        const cell  = svgAttribs.cells.get(attribs.name);
        if (cell && cell.cellProps.tooltips) {
          const cellElement = document.getElementById(cell.cellId)
          if (cellElement === null) { return; }
          if (event.type === 'mouseover' ) {
            if (activeElement === null) {
              activeElement = cellElement
            }
            else if (cellElement.id === activeElement.id) {
              return;
            }
            // console.log("tooltipHandlerFactory(): tooltipConfig:", tooltipConfig, " - tooltipContent:", tooltipContentRef.current)

            if (cell.cellIdShort !== tooltipConfig.elementId) {
              setTooltipContent(cell.tooltip.tooltipContent)
            }
            tooltipTrigger?.setMousePosition(event.clientX, event.clientY, cell.cellIdShort);
            // console.log('tooltipHandlerFactory: mouseover :' + cell.cellIdShort, cell);
            // event.stopPropagation();
          }
          else if(event.type === 'mouseout') {
            if ( !cellElement?.contains(event.relatedTarget as HTMLElement) ) { 
              setTooltipOpen(false);
              activeElement = null;
            }
          }
        }
      }
    }
  }
}

export const FlowPanel: React.FC<Props> = ({ options, data, width, height, timeZone, eventBus }) => {
  //---------------------------------------------------------------------------
  // State for 'load -> init -> update' startup phasing

  const [svgStr, setSvgStr] = useState<string | undefined>();
  const [panelConfig, setPanelConfig] = useState<PanelConfig | undefined>(undefined);
  const panelConfigError = useRef<string | undefined>('');
  const [siteConfig, setSiteConfig] = useState<SiteConfig | undefined>(undefined);
  const [initialized, setInitialized] = useState<boolean>(false);
  const [highlighterSelection, setHighlighterSelection] = useState<string|undefined>(undefined);
  const [timeSliderLabel, setTimeSliderLabel] = useState<string>();
  const [animationsEnabled, setAnimationsEnabled] = useState<boolean>(options.animationsEnabled);
  const timeSliderScalarRef = useRef<number>(1);
  const debuggingCtrRef = useRef<DebuggingCtrs>({...options.debuggingCtr});
  const svgHolderRef = useRef<SvgHolder>();
  const clickHandlerRef = useRef<any>(null);
  const mouseOverHandlerRef = useRef<any>(null);
  const svgDocBlankRef = useRef<Document>(new DOMParser().parseFromString('<svg/>', "text/xml"));
  const grafanaTheme = useRef<GrafanaTheme2>(useTheme2());

  //---------------------------------------------------------------------------
  // TooltipTrigger

  const setTooltipContentRef = useRef<React.Dispatch<React.SetStateAction<string | React.JSX.Element>> | null>(null);
  const registerSetterSetTooltipContent = useCallback( (setter: React.Dispatch<React.SetStateAction<string | React.JSX.Element>>) => {
    setTooltipContentRef.current = setter;
  }, [] );
  const tooltipContentRef = useRef<React.JSX.Element | string >("");
  const tooltipContainerRef = useRef<HTMLDivElement | null>(null);

  function setTooltipContentWrapper( ){
    return function( content: React.JSX.Element | string) {
      if( !setTooltipContentRef.current ) {
        return;
      }

      // console.log("setTooltipContentWrapper: ici - typeof content: ", typeof content)
      if (typeof content === "string") {
        setTooltipContentRef.current( (<div ref={tooltipContainerRef} dangerouslySetInnerHTML={{__html: content}}/>) );
      } else {
        setTooltipContentRef.current( (<div ref={tooltipContainerRef}>{content}</div>) );
      }
    }
  }
  useEffect( () =>{
      if (tooltipContainerRef && tooltipContainerRef.current) {
            const containerRect = tooltipContainerRef.current?.getBoundingClientRect() ?? new DOMRect(0, 0, 0, 0);
            console.log('FlowPanel.useEffect(/tooltipContainerRef): container rect:', containerRect);
      }
    }, [tooltipContainerRef.current]
  )
  const setTooltipOpenRef = useRef<React.Dispatch<React.SetStateAction<boolean>> | null>(null);
  const registerSetterSetTooltipOpen = useCallback( (setter: React.Dispatch<React.SetStateAction<boolean>>) => {
    setTooltipOpenRef.current = setter;
  }, [] );

  const setTooltipConfigRef = useRef<React.Dispatch<React.SetStateAction<TooltipTriggerConfig>> | null>(null);
  const registerSetterSetTooltipConfig = useCallback( (setter: React.Dispatch<React.SetStateAction<TooltipTriggerConfig>>) => {
    setTooltipConfigRef.current = setter;
  }, [] );
  const tooltipConfigRef = useRef<TooltipTriggerConfig>({ x: 0, y: 0, elementId: "" });
  // const tooltipContainerRef = useRef<HTMLDivElement | null>(null);
  const tooltipTriggerRef = useRef<TooltipTriggerHandle>(null);
  useEffect(()=> {
    if (tooltipTriggerRef.current) {
      // tooltipTriggerRef.current.setContainerDim(0,0);
      tooltipContentRef.current = tooltipTriggerRef.current.getTooltipContentRef();
      tooltipConfigRef.current = tooltipTriggerRef.current.getTooltipConfigRef();
      console.log("useEffect(/tooltipTriggerRef): tooltipConfigRef", tooltipConfigRef);
      // tooltipContainerRef.current = tooltipTriggerRef.current.getTooltipRef();
    }
  }, [tooltipTriggerRef.current])

  const tooltipOverlayRef = useRef<HTMLDivElement | null>(null);
 
  //---------------------------------------------------------------------------
  // Dynamic URL Terms: If we load from url we record any variable substitutions
  // that occurred so we can force a re-initialize if any of those variables change
  // value.

  const [variableIdsSvg, setVariableIdsSvg] = useState<string>('');
  const [variableIdsPanel, setVariableIdsPanel] = useState<string>('');
  const [variableIdsSite, setVariableIdsSite] = useState<string>('');
  const [actDynamicUrlCtr, setActDynamicUrlCtr] = useState<number>(0);

  //---------------------------------------------------------------------------
  // Load config and svg

  useEffect(() => {
    // console.log("load config")
    svgHolderRef.current = undefined;
    panelConfigError.current = 'test error';
    setInitialized(false);
    setSvgStr(undefined);
    setPanelConfig(undefined);
    setSiteConfig(undefined);
    loadSvg(options.svg, setSvgStr, setVariableIdsSvg);
    loadYaml(options.siteConfig, panelConfigError, (config) => {setSiteConfig(siteConfigFactory(config))}, setVariableIdsSite);
    loadYaml(options.panelConfig, panelConfigError, (config) => {setPanelConfig(panelConfigFactory(config))}, setVariableIdsPanel);
  }, [options.svg, options.panelConfig, options.siteConfig, actDynamicUrlCtr]);

  //---------------------------------------------------------------------------
  // Monitor for url changes

  // We need to not trigger a reload for the initial settings, just for subsequent
  // change. This logic achieves that by ensuring pass 1, 2, n do not go into the
  // incrementer.
  // pass 1: last='', current=''
  // pass 2: last='', current=<stuff>
  // pass n: last=<stuff>, current=<stuff>
  const dynamicUrlTerms = useRef<string>('');

  const dynamicUrlTermsLast = dynamicUrlTerms.current;
  dynamicUrlTerms.current = getTemplateSrv().replace(variableIdsSvg + variableIdsPanel + variableIdsSite);
  if ((dynamicUrlTermsLast.length !== 0) && (dynamicUrlTermsLast !== dynamicUrlTerms.current)) {
    setActDynamicUrlCtr(actDynamicUrlCtr + 1);
  }

  //---------------------------------------------------------------------------
  // Initialize DOM and config

  useEffect( () => {
    if (tooltipOverlayRef.current) {
      const overlayRect = tooltipOverlayRef.current?.getBoundingClientRect() ?? new DOMRect(0, 0, 0, 0);
      tooltipTriggerRef.current?.setOverlayRect(overlayRect);
    }
  }, [tooltipOverlayRef.current])

  useEffect(() => {
    if (svgStr && panelConfig && siteConfig) {
      configInit(siteConfig, panelConfig, grafanaTheme.current.isDark);

      const svgDoc = new DOMParser().parseFromString(sanitizeSvgStr(svgStr), "text/xml");
      const svgAttribs = svgInit(svgDoc, grafanaTheme.current, panelConfig, siteConfig);
      svgHolderRef.current = {
        doc: svgDoc,
        attribs: svgAttribs,
      };
      clickHandlerRef.current = clickHandlerFactory(svgAttribs.elementAttribs, panelConfig.linkVariables);
      mouseOverHandlerRef.current = tooltipHandlerFactory(
        svgAttribs,
        setTooltipContentWrapper(),
        setTooltipConfigRef.current,
        tooltipConfigRef,
        setTooltipOpenRef.current,
        tooltipTriggerRef.current,
      );
      setHighlighterSelection(highlighterInitialState(options.highlighterSelection, panelConfig.highlighter));
      setInitialized(true);
    }
  }, [initialized, svgStr, panelConfig, siteConfig, options.highlighterSelection]);
  

  //---------------------------------------------------------------------------
  // Interpolate time-series data

  const timingsEnabled = (typeof options.debuggingCtr.timingsCtr === 'number') &&
    (options.debuggingCtr.timingsCtr !== debuggingCtrRef.current.timingsCtr);
  const instrument = getInstrumenter(timingsEnabled);
  const templateSrv = getTemplateSrv();
  const timeMin = Number(templateSrv.replace("${__from}"));
  const timeMax = Number(templateSrv.replace("${__to}"));

  const dataConverter = function(arr: any[]) { return arr.map((item: any) => toDataFrame(item)) };
  const dataFrames = instrument('toDataFrame', dataConverter)(data.series || []);
  let tsData = instrument('transform', seriesTransform)(dataFrames, timeMin, timeMax, panelConfig?.dataRefTransform);

  if (options.testDataEnabled) {
    instrument('seriesExtend', seriesExtend)(tsData, panelConfig?.test);
  }
  
  instrument('seriesInterpolate', seriesInterpolate)(tsData, timeSliderScalarRef.current);

  //---------------------------------------------------------------------------
  // Update the SVG Attributes with the interpolated time-series data 

  let svgHolder = svgHolderRef.current;
  if (svgHolder) {
    // Snapshot the monitored variable states
    const variableValues = svgHolder.attribs.variableValues;
    templateSrv.getVariables().forEach((variable: any) => {
      try {
        if (typeof variableValues.get(variable.id) !== 'undefined') {
          variableValues.set(variable.id, variable.current.value);
        }
      }
      catch (err) {
        flowDebug().warn('Error occurred accessing variable', variable, ', error =', err);
      }
    });
  
    // Update the svg with current time-series and variable settings
    // console.log("flowPanel:instrument() launch svgUpdate()")
    instrument('svgUpdate', svgUpdate)(
      svgHolder,
      tsData,
      highlighterSelection,
      animationsEnabled,
      setTooltipContentWrapper(),
      tooltipContentRef,
      tooltipConfigRef,
    );
  }
  const svgElement = (svgHolder ? svgHolder.doc : svgDocBlankRef.current).childNodes[0] as HTMLElement;

  //---------------------------------------------------------------------------
  // Debugging data exports

  useEffect(() => {
    if (svgHolderRef.current && debuggingCtrRef.current) {
      if (options.debuggingCtr.timingsCtr) {
        if (options.debuggingCtr.timingsCtr !== debuggingCtrRef.current.timingsCtr) {
          // The ctr delta was detected upstream and the timings enabled for this pass
          // via the instrument function. Here we just reset the timers.
          debuggingCtrRef.current.timingsCtr = options.debuggingCtr.timingsCtr;
        }
      }

      if (options.debuggingCtr.colorsCtr) {
        if (options.debuggingCtr.colorsCtr !== debuggingCtrRef.current.colorsCtr) {
          debuggingCtrRef.current.colorsCtr = options.debuggingCtr.colorsCtr;
          displayColorsInner(grafanaTheme.current.visualization.hues);
        }
      }

      if (options.debuggingCtr.mappingsCtr && panelConfig) {
        if (options.debuggingCtr.mappingsCtr !== debuggingCtrRef.current.mappingsCtr) {
          debuggingCtrRef.current.mappingsCtr = options.debuggingCtr.mappingsCtr;
          displayMappingsInner(panelConfig, svgHolderRef.current);
        }
      }

      if (options.debuggingCtr.dataCtr) {
        if (options.debuggingCtr.dataCtr !== debuggingCtrRef.current.dataCtr) {
          debuggingCtrRef.current.dataCtr = options.debuggingCtr.dataCtr;
          displayDataInner(data.series, tsData);
        }
      }
      if (options.debuggingCtr.displaySvgCtr) {
        if (options.debuggingCtr.displaySvgCtr !== debuggingCtrRef.current.displaySvgCtr) {
          debuggingCtrRef.current.displaySvgCtr = options.debuggingCtr.displaySvgCtr;
          displaySvgInner(svgElement.outerHTML);
        }
      }
    }
  }, [options.debuggingCtr, data.series, tsData, svgElement.outerHTML, panelConfig]);

  //---------------------------------------------------------------------------
  // Controls

  const timeSliderEnabled = options.timeSliderEnabled;

  const highlighterEnabled = options.highlighterEnabled &&
    (panelConfig?.highlighter?.tagLegend?.length || 0) > 0;

  const animationControlPosition = options.animationControlEnabled && panelConfig?.animationsPresent ?
    timeSliderEnabled ? AnimationControlPosition.timeSlider :
    highlighterEnabled ? AnimationControlPosition.highlighter : AnimationControlPosition.own : AnimationControlPosition.none;

  //---------------------------------------------------------------------------
  // Animation control

  const animationControl = panelConfig?.animationsPresent ? (<Button
    tooltip="Toggle animation state"
    fill="text"
    size="md"
    icon={animationsEnabled ? "pause" : "play"}
    onClick={() => setAnimationsEnabled(!animationsEnabled)}>
  </Button>) : null;
  
  //---------------------------------------------------------------------------
  // Highlighter

  const styles = useStyles2(getStyles);
  const highlighter = HighlighterFactory({
    animControl: animationControlPosition === AnimationControlPosition.highlighter ? animationControl : null,
    styles: styles,
    enabled: highlighterEnabled,
    highlighterConfig: panelConfig?.highlighter,
    setSelection: setHighlighterSelection,
    selection: highlighterSelection,
  });

  //---------------------------------------------------------------------------
  // TimeSlider

  const timeSlider = TimeSliderFactory({
    animControl: animationControlPosition === AnimationControlPosition.timeSlider ? animationControl : null,
    styles: styles,
    enabled: options.timeSliderEnabled,
    mode: options.timeSliderMode,
    label: timeSliderLabel,
    setLabel: setTimeSliderLabel,
    timeSliderScalarRef: timeSliderScalarRef,
    tsData: tsData,
    windowWidth: width,
    timeZone: timeZone,
    eventBus: eventBus,
  });

  //---------------------------------------------------------------------------
  // Define the background

  const svgAttribs = svgHolder ? svgHolder.attribs : {
    width: width,
    height: height,
    scaleDrive: false,
    highlightFactors: {
      highlightRgbFactor: 1.0,
      lowlightAlphaFactor: 1.0,
    }
  };
  let bgColor = useTheme2().isDark ? panelConfig?.background.darkThemeColor : panelConfig?.background.lightThemeColor;
  if (bgColor) {
    bgColor = colorLookup(bgColor, HighlightState.Ambient, svgAttribs.highlightFactors);
  }

  //---------------------------------------------------------------------------
  // Define the canvas

  const animationControlOwn = animationControlPosition === AnimationControlPosition.own;
  const condensed = panelConfig?.highlighter?.condensed;
  const firstSeparator = highlighterEnabled || timeSliderEnabled || animationControlOwn;
  const secondSeparator = highlighterEnabled && timeSliderEnabled && !condensed;
  
  const svgWidth = svgAttribs.width;
  const svgHeight = svgAttribs.height;
  const controlHeight = highlighterEnabled && timeSliderEnabled && condensed ? 40 : 60;
  const highlighterHeight = highlighterEnabled ? controlHeight : 0;
  const animControlHeight = animationControlOwn ? 60 : 0;
  const timeSliderHeight = timeSliderEnabled ? controlHeight : 0;
  const svgViewWidth = width;
  const svgViewHeight = height - highlighterHeight - timeSliderHeight - animControlHeight;
  const svgScaleX = svgViewWidth / svgWidth;
  const svgScaleY = svgViewHeight / svgHeight;
  const svgScale = Math.min(svgScaleX, svgScaleY);
  const svgPaddingLeft = Math.max(0, (width - (svgWidth * svgScale)) * 0.5);
  const svgPaddingTop = Math.max(0, (svgViewHeight - (svgHeight * svgScale)) * 0.5);

  //---------------------------------------------------------------------------
  // Create the JSX

  const jsx = instrument('createJsx', () => (
    <div style={{ position: "relative", width, height }}>
      <TransformWrapper
        disabled={!options.panZoomEnabled}
        doubleClick={{mode: "reset"}}
        wheel={{activationKeys: panelConfig?.zoomPanPinch.wheelActivationKeys || []}}

      >
        <TransformComponent>
          <div className={cx(
            styles.wrapper,
            css`
            height: ${svgViewHeight}px;
            width: ${svgViewWidth}px;
            display: flex;
            padding-left: ${svgPaddingLeft}px;
            padding-top: ${svgAttribs.scaleDrive ? svgPaddingTop : 0}px;
            ${bgColor ? "background-color: " + bgColor : ""};
            `
            )}>
            <div className={cx(
              styles.wrapper,
              css`
              scale: ${svgAttribs.scaleDrive ? svgScale * 100 : 100}%;
              display: flex;
              transform-origin: top left;
              `
              )}
              onClick={clickHandlerRef.current}
              onMouseOver={mouseOverHandlerRef.current}
              onMouseOut={mouseOverHandlerRef.current}
              onMouseMove={mouseOverHandlerRef.current}
              // The externally received svg is sanitized when read in via sanitizeSvgStr which uses
              // dompurify. We don't re-sanitize it on each rendering as we are in control of the
              // modifications being made.
              dangerouslySetInnerHTML={{__html: svgElement.outerHTML}}/>
          </div>
        </TransformComponent>

        {/* fixed not transformed overlay, clipped to visible zone. */ }
        <div
          ref={tooltipOverlayRef}
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            // overflow: "hidden", // le tooltip stays in the visible zone
            pointerEvents: "none", // don't block interactions
          }}
        />
      </TransformWrapper>
      {firstSeparator ? <hr/> : undefined}
      <div>{highlighterEnabled && highlighter}</div>
      {secondSeparator ? <hr/> : undefined}
      <div>{timeSliderEnabled && timeSlider}</div>
      {animationControlOwn ? animationControl : undefined}
      { tooltipOverlayRef.current && 
        createPortal(
          <TooltipTrigger
            ref={tooltipTriggerRef}
            content=""
            config={tooltipConfigRef.current}
            open={false}
            registerSetterSetTooltipContent={registerSetterSetTooltipContent}
            registerSetterSetTooltipOpen={registerSetterSetTooltipOpen}
            registerSetterSetTooltipConfig={registerSetterSetTooltipConfig}
          />,
          tooltipOverlayRef.current
        )}
    </div>
  ))();
  return jsx;
};
