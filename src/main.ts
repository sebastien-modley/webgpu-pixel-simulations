import { Pane } from "tweakpane";
import { reportToUser } from "./utils/util";
import run from "./levels/custom fire - wood/main";

const canvas = document.querySelector("canvas");
canvas.width = 300;
canvas.height = 300;

(async () => {
    if (!navigator.gpu) {
        reportToUser("WebGPU not supported on this browser.");
        throw new Error("WebGPU not supported on this browser.");
    }

    const adapter = await navigator.gpu.requestAdapter();
    if (!adapter) {
        reportToUser("No appropriate GPUAdapter found.");
        throw new Error("No appropriate GPUAdapter found.");
    }

    const device = await adapter.requestDevice();

    const observer = new ResizeObserver(() => {
        canvas.width = canvas.clientWidth;
        canvas.height = canvas.clientHeight;

        handleResize();
    });
    observer.observe(canvas);

    const context = canvas.getContext("webgpu");
    const canvasFormat = navigator.gpu.getPreferredCanvasFormat();
    context.configure({
        device: device,
        format: canvasFormat,
    });

    // Tweakpane: easily adding tweak control for parameters.
    const PARAMS = {
        level: 0,
        name: "Test",
        active: true,
    };

    const pane = new Pane({
        title: "Debug",
        expanded: false,
    });

    pane.addInput(PARAMS, "level", { min: 0, max: 100 });
    pane.addInput(PARAMS, "name");
    pane.addInput(PARAMS, "active");

    run(device, context, canvasFormat);
})();

function handleResize() {}
