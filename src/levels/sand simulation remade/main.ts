import {
    ArrayDefinition,
    StructuredView,
    makeShaderDataDefinitions,
    makeStructuredView,
} from "webgpu-utils";
import { StatLogger } from "../../utils/StatLogger";
import shader_simulation from "./shaders/shader_sim";
import shader_visuals from "./shaders/shader_visuals";
import { shader_data } from "./shaders/shader_data";
import { Pane } from "tweakpane";
import { BindingApi, FolderApi } from "@tweakpane/core";
import shader_vertex_fragment from "./shaders/shader_vertex_fragment";

const GRID_SIZE = 128;
const UPDATE_INTERVAL_MS = (fps) => 1000 / fps;
const WORKGROUP_SIZE = 4;
const LOG_EVERY_X_FRAMES = 120;
const RENDERING_ENABLED = true;

const statLogger = new StatLogger(LOG_EVERY_X_FRAMES);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const SIM_PARAMS = {
    "updates / frame": 2,
    fps: 60,
};

var mousePosition = [-1, -1];
var mouseDown = false;

async function sand_run_remake(
    canvas: HTMLCanvasElement,
    device: GPUDevice,
    context: GPUCanvasContext,
    canvasFormat: GPUTextureFormat,
    pane: Pane
) {
    const vertexAndFragmentModule = device.createShaderModule({
        label: "Vertex & Fragment shader",
        code: shader_vertex_fragment(),
    });

    const simulationShaderModule = device.createShaderModule({
        label: "Simulation shader",
        code: shader_simulation(device, WORKGROUP_SIZE),
    });

    const simulationVisualsUpdaterModule = device.createShaderModule({
        label: "Simulation visuals updater shader",
        code: shader_visuals(WORKGROUP_SIZE),
    });

    const simSettingsFolder = pane.addFolder({ title: "Simulation settings" });
    simSettingsFolder.addBinding(SIM_PARAMS, "updates / frame", {
        min: 0,
        max: 20,
        step: 1,
    });
    simSettingsFolder.addBinding(SIM_PARAMS, "fps", {
        min: 1,
        max: 240,
        step: 1,
    });

    const shaderDefs = makeShaderDataDefinitions(shader_data);

    console.log(shaderDefs);
    const arrayBuffers = {
        cellStateIn: new ArrayBuffer(
            (
                shaderDefs.storages["cellStateIn"]
                    .typeDefinition as ArrayDefinition
            ).elementType.size *
                GRID_SIZE *
                GRID_SIZE
        ),
        cellStateOut: new ArrayBuffer(
            (
                shaderDefs.storages["cellStateOut"]
                    .typeDefinition as ArrayDefinition
            ).elementType.size *
                GRID_SIZE *
                GRID_SIZE
        ),
        neighbourhood_intent: new ArrayBuffer(
            (
                shaderDefs.storages["neighbourhood_intent"]
                    .typeDefinition as ArrayDefinition
            ).elementType.size *
                GRID_SIZE *
                GRID_SIZE *
                9
        ),
        neighbourhood_maintain: new ArrayBuffer(
            (
                shaderDefs.storages["neighbourhood_maintain"]
                    .typeDefinition as ArrayDefinition
            ).elementType.size *
                GRID_SIZE *
                GRID_SIZE *
                9
        ),
        simulationVisualsIn: new ArrayBuffer(
            (
                shaderDefs.storages["simulationVisualsIn"]
                    .typeDefinition as ArrayDefinition
            ).elementType.size *
                GRID_SIZE *
                GRID_SIZE
        ),
        simulationVisualsOut: new ArrayBuffer(
            (
                shaderDefs.storages["simulationVisualsOut"]
                    .typeDefinition as ArrayDefinition
            ).elementType.size *
                GRID_SIZE *
                GRID_SIZE
        ),
        updatesInFrame: new ArrayBuffer(
            (
                shaderDefs.storages["updatesInFrame"]
                    .typeDefinition as ArrayDefinition
            ).elementType.size * 2
        ),
    };

    const shaderDataObjects: { [key: string]: StructuredView } = {};
    const shaderTypesToRead = [
        shaderDefs.uniforms,
        shaderDefs.storages,
        shaderDefs.storageTextures,
    ];
    shaderTypesToRead.forEach((shaderType) => {
        Object.keys(shaderType).forEach((inputName) => {
            shaderDataObjects[inputName] = Object.hasOwn(
                arrayBuffers,
                inputName
            )
                ? makeStructuredView(
                      shaderType[inputName],
                      arrayBuffers[inputName]
                  )
                : makeStructuredView(shaderType[inputName]);
        });
    });

    const shaderDataUsages: { [key: string]: number } = {
        grid: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
        time: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
        cellStateIn: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
        cellStateOut: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
        neighbourhood_intent: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
        neighbourhood_maintain:
            GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
        mouse_data: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
        simulationVisualsIn: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
        simulationVisualsOut: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
        updatesInFrame: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
        bindingTag: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    };
    console.log(shaderDataUsages);

    shaderDataObjects.grid.set([GRID_SIZE, GRID_SIZE]);
    shaderDataObjects.time.set(window.performance.now());
    const cellStartData = Array(GRID_SIZE * GRID_SIZE);
    // for (let x = 0; x < GRID_SIZE; x++) {
    //     cellStartData[(GRID_SIZE - 1) * GRID_SIZE + x] = 1;
    // }
    // for (let x = 0; x < GRID_SIZE; x++) {
    //     for (
    //         let y = (GRID_SIZE * 3) / 4 - 10;
    //         y < (GRID_SIZE * 3) / 4 + 10;
    //         y++
    //     ) {
    //         cellStartData[y * GRID_SIZE + x] = 1;
    //     }
    // }

    // for (let i = 0; i < GRID_SIZE * GRID_SIZE; ++i) {
    //     const x = i % GRID_SIZE;
    //     const y = i / GRID_SIZE;
    //     const distFromMiddle =
    //         Math.abs(x - GRID_SIZE / 2) + Math.abs(y - GRID_SIZE / 2);
    //     cellStartData[i] = Math.random() > distFromMiddle / GRID_SIZE ? 1 : 0;
    // }

    shaderDataObjects["cellStateIn"].set(cellStartData);
    shaderDataObjects["mouse_data"].set({ pos: mousePosition, down: false });

    shaderDataObjects["simulationVisualsIn"].set(
        new Array(GRID_SIZE * GRID_SIZE).fill([0, 0, 0, 0])
    );
    shaderDataObjects["simulationVisualsOut"].set(
        new Array(GRID_SIZE * GRID_SIZE).fill([0, 0, 0, 0])
    );

    shaderDataObjects["updatesInFrame"].set([0, 0]);

    const shaderDataBuffers: { [key: string]: GPUBuffer } = {};

    for (var shaderDataElementName in shaderDataObjects) {
        if (!shaderDataObjects.hasOwnProperty(shaderDataElementName)) continue;
        if (
            shaderDataObjects[shaderDataElementName].arrayBuffer.byteLength == 0
        )
            console.error(
                `Buffer '${shaderDataElementName}' created with byte length 0!`
            );
        if (!shaderDataUsages.hasOwnProperty(shaderDataElementName)) {
            console.error(
                `Buffer '${shaderDataElementName}' does not have any assigned usages!`
            );
        }
        shaderDataBuffers[shaderDataElementName] = device.createBuffer({
            label: `Buffer '${shaderDataElementName}'`,
            size: shaderDataObjects[shaderDataElementName].arrayBuffer
                .byteLength,
            usage: shaderDataUsages[shaderDataElementName],
        });
        device.queue.writeBuffer(
            shaderDataBuffers[shaderDataElementName],
            0,
            shaderDataObjects[shaderDataElementName].arrayBuffer
        );
    }

    console.log(shaderDataBuffers);

    const bindGroupLayout = device.createBindGroupLayout({
        label: "Cell Bind Group Layout",
        entries: [
            {
                binding: shaderDefs.uniforms["grid"].binding,
                visibility:
                    GPUShaderStage.VERTEX |
                    GPUShaderStage.FRAGMENT |
                    GPUShaderStage.COMPUTE,
                buffer: {}, // Grid uniform buffer
            },
            {
                binding: shaderDefs.uniforms["time"].binding,
                visibility: GPUShaderStage.COMPUTE | GPUShaderStage.FRAGMENT,
                buffer: {}, // time uniform buffer
            },
            {
                binding: shaderDefs.storages["cellStateIn"].binding,
                visibility:
                    GPUShaderStage.VERTEX |
                    GPUShaderStage.FRAGMENT |
                    GPUShaderStage.COMPUTE,
                buffer: { type: "read-only-storage" }, // Cell state input buffer
            },
            {
                binding: shaderDefs.storages["cellStateOut"].binding,
                visibility: GPUShaderStage.COMPUTE,
                buffer: { type: "storage" }, // Cell state output buffer
            },
            {
                binding: shaderDefs.storages["neighbourhood_intent"].binding,
                visibility: GPUShaderStage.COMPUTE,
                buffer: { type: "storage" }, //intent temp
            },
            {
                binding: shaderDefs.storages["neighbourhood_maintain"].binding,
                visibility: GPUShaderStage.COMPUTE,
                buffer: { type: "storage" }, //keeping temp
            },
            {
                binding: shaderDefs.uniforms["mouse_data"].binding,
                visibility: GPUShaderStage.COMPUTE,
                buffer: {},
            },
            {
                binding: shaderDefs.storages["simulationVisualsIn"].binding,
                visibility:
                    GPUShaderStage.VERTEX |
                    GPUShaderStage.FRAGMENT |
                    GPUShaderStage.COMPUTE,
                buffer: { type: "read-only-storage" },
            },
            {
                binding: shaderDefs.storages["simulationVisualsOut"].binding,
                visibility: GPUShaderStage.COMPUTE,
                buffer: { type: "storage" },
            },
            {
                binding: shaderDefs.storages["updatesInFrame"].binding,
                visibility: GPUShaderStage.COMPUTE,
                buffer: { type: "storage" }, // Grid uniform buffer
            },
            {
                binding: shaderDefs.uniforms["bindingTag"].binding,
                visibility:
                    GPUShaderStage.VERTEX |
                    GPUShaderStage.FRAGMENT |
                    GPUShaderStage.COMPUTE,
                buffer: {},
            },
        ],
    });

    const bindingTagBuffers: [GPUBuffer, GPUBuffer] = [null, null];
    for (let i = 0; i < 2; i++) {
        bindingTagBuffers[i] = device.createBuffer({
            label: `Buffer 'bindingTag'`,
            size: 4,
            usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
        });
        device.queue.writeBuffer(bindingTagBuffers[i], 0, new Uint32Array([i]));
    }

    const bindGroups = [
        device.createBindGroup({
            label: "Cell renderer bind group A",
            layout: bindGroupLayout,
            entries: [
                {
                    binding: shaderDefs.uniforms["grid"].binding,
                    resource: { buffer: shaderDataBuffers.grid },
                },
                {
                    binding: shaderDefs.uniforms["time"].binding,
                    resource: { buffer: shaderDataBuffers.time },
                },
                {
                    binding: shaderDefs.storages["cellStateIn"].binding,
                    resource: { buffer: shaderDataBuffers.cellStateIn },
                },
                {
                    binding: shaderDefs.storages["cellStateOut"].binding,
                    resource: { buffer: shaderDataBuffers.cellStateOut },
                },
                {
                    binding:
                        shaderDefs.storages["neighbourhood_intent"].binding,
                    resource: {
                        buffer: shaderDataBuffers.neighbourhood_intent,
                    },
                },
                {
                    binding:
                        shaderDefs.storages["neighbourhood_maintain"].binding,
                    resource: {
                        buffer: shaderDataBuffers.neighbourhood_maintain,
                    },
                },
                {
                    binding: shaderDefs.uniforms["mouse_data"].binding,
                    resource: { buffer: shaderDataBuffers.mouse_data },
                },
                {
                    binding: shaderDefs.storages["simulationVisualsIn"].binding,
                    resource: {
                        buffer: shaderDataBuffers.simulationVisualsIn,
                    },
                },
                {
                    binding:
                        shaderDefs.storages["simulationVisualsOut"].binding,
                    resource: {
                        buffer: shaderDataBuffers.simulationVisualsOut,
                    },
                },
                {
                    binding: shaderDefs.storages["updatesInFrame"].binding,
                    resource: { buffer: shaderDataBuffers.updatesInFrame },
                },
                {
                    binding: shaderDefs.uniforms["bindingTag"].binding,
                    resource: { buffer: bindingTagBuffers[0] },
                },
            ],
        }),
        device.createBindGroup({
            //inverse in and out storages
            label: "Cell renderer bind group B",
            layout: bindGroupLayout,

            entries: [
                {
                    binding: shaderDefs.uniforms["grid"].binding,
                    resource: { buffer: shaderDataBuffers.grid },
                },
                {
                    binding: shaderDefs.uniforms["time"].binding,
                    resource: { buffer: shaderDataBuffers.time },
                },
                {
                    binding: shaderDefs.storages["cellStateIn"].binding,
                    resource: { buffer: shaderDataBuffers.cellStateOut },
                },
                {
                    binding: shaderDefs.storages["cellStateOut"].binding,
                    resource: { buffer: shaderDataBuffers.cellStateIn },
                },
                {
                    binding:
                        shaderDefs.storages["neighbourhood_intent"].binding,
                    resource: {
                        buffer: shaderDataBuffers.neighbourhood_intent,
                    },
                },
                {
                    binding:
                        shaderDefs.storages["neighbourhood_maintain"].binding,
                    resource: {
                        buffer: shaderDataBuffers.neighbourhood_maintain,
                    },
                },
                {
                    binding: shaderDefs.uniforms["mouse_data"].binding,
                    resource: { buffer: shaderDataBuffers.mouse_data },
                },
                {
                    binding: shaderDefs.storages["simulationVisualsIn"].binding,
                    resource: {
                        buffer: shaderDataBuffers.simulationVisualsOut,
                    },
                },
                {
                    binding:
                        shaderDefs.storages["simulationVisualsOut"].binding,
                    resource: {
                        buffer: shaderDataBuffers.simulationVisualsIn,
                    },
                },
                {
                    binding: shaderDefs.storages["updatesInFrame"].binding,
                    resource: { buffer: shaderDataBuffers.updatesInFrame },
                },
                {
                    binding: shaderDefs.uniforms["bindingTag"].binding,
                    resource: { buffer: bindingTagBuffers[1] },
                },
            ],
        }),
    ];

    const pipelineLayout = device.createPipelineLayout({
        label: "Cell Pipeline Layout",
        bindGroupLayouts: [bindGroupLayout],
    });

    const { vertices, vertexBufferLayout, vertexBuffer } =
        _createVertexBuffer(device);
    const cellPipeline = device.createRenderPipeline({
        label: "Cell pipeline",
        layout: pipelineLayout,
        vertex: {
            module: vertexAndFragmentModule,
            entryPoint: "vertexMain",
            buffers: [vertexBufferLayout],
        },
        fragment: {
            module: vertexAndFragmentModule,
            entryPoint: "fragmentMain",
            targets: [
                {
                    format: canvasFormat,
                },
            ],
        },
    });

    const simulationPipelines = {
        push: device.createComputePipeline({
            label: "Simulation pipeline: push",
            layout: pipelineLayout,
            compute: {
                module: simulationShaderModule,
                entryPoint: "compute_push",
            },
        }),
        pull: device.createComputePipeline({
            label: "Simulation pipeline: pull",
            layout: pipelineLayout,
            compute: {
                module: simulationShaderModule,
                entryPoint: "compute_pull",
            },
        }),
        update: device.createComputePipeline({
            label: "Simulation pipeline: update",
            layout: pipelineLayout,
            compute: {
                module: simulationShaderModule,
                entryPoint: "compute_update",
            },
        }),
    };

    const visualsUpdatePipelines = {
        first: device.createComputePipeline({
            label: "Visuals update pipeline: First",
            layout: pipelineLayout,
            compute: {
                module: simulationVisualsUpdaterModule,
                entryPoint: "compute_update_visuals",
            },
        }),
    };

    canvas.addEventListener("mousemove", (ev) => {
        mousePosition = [
            (ev.pageX - canvas.offsetLeft) / canvas.width,
            1 - (ev.pageY - canvas.offsetTop) / canvas.height,
        ];
    });
    canvas.addEventListener("mousedown", (ev) => {
        mouseDown = true;
    });
    canvas.addEventListener("mouseup", (ev) => {
        mouseDown = false;
    });

    let simulationStep = 0;
    var previousFrameTime = window.performance.now();
    while (true) {
        const startFrameTime = window.performance.now();
        statLogger.log("fps", 1000 / (startFrameTime - previousFrameTime));
        await updateGrid();
        statLogger.log("calc time", window.performance.now() - startFrameTime);
        previousFrameTime = window.performance.now();
        await sleep(
            Math.max(
                0,
                UPDATE_INTERVAL_MS(SIM_PARAMS["fps"]) -
                    (window.performance.now() - previousFrameTime)
            )
        );
    }
    async function dispatchComputePass(encoder: GPUCommandEncoder) {
        const workgroupCount = Math.ceil(GRID_SIZE / WORKGROUP_SIZE);
        const computePass = encoder.beginComputePass();

        device.queue.writeBuffer(
            shaderDataBuffers.time,
            0,
            new Float32Array([window.performance.now()])
        );

        shaderDataObjects["mouse_data"].set({
            pos: mousePosition,
            down: mouseDown ? 1 : 0,
        });
        device.queue.writeBuffer(
            shaderDataBuffers.mouse_data,
            0,
            shaderDataObjects["mouse_data"].arrayBuffer
        );
        const updates = SIM_PARAMS["updates / frame"];

        if (updates > 0) {
            shaderDataObjects["simulationVisualsIn"].set(
                new Array(GRID_SIZE * GRID_SIZE).fill([0, 0, 0, 0])
            );
            device.queue.writeBuffer(
                shaderDataBuffers["simulationVisualsIn"],
                0,
                shaderDataObjects["simulationVisualsIn"].arrayBuffer
            );
        }

        shaderDataObjects["updatesInFrame"].set([0, 0]);
        device.queue.writeBuffer(
            shaderDataBuffers["updatesInFrame"],
            0,
            shaderDataObjects["updatesInFrame"].arrayBuffer
        );

        for (let i = 0; i < updates; i++) {
            shaderDataObjects["simulationVisualsOut"].set(
                new Array(GRID_SIZE * GRID_SIZE).fill([0, 0, 0, 0])
            );
            device.queue.writeBuffer(
                shaderDataBuffers["simulationVisualsOut"],
                0,
                shaderDataObjects["simulationVisualsOut"].arrayBuffer
            );

            computePass.setBindGroup(0, bindGroups[simulationStep % 2]);

            computePass.setPipeline(simulationPipelines.push);
            computePass.dispatchWorkgroups(workgroupCount, workgroupCount);

            computePass.setPipeline(simulationPipelines.pull);
            computePass.dispatchWorkgroups(workgroupCount, workgroupCount);

            computePass.setPipeline(simulationPipelines.update);
            computePass.dispatchWorkgroups(workgroupCount, workgroupCount);

            computePass.setPipeline(visualsUpdatePipelines.first);
            computePass.dispatchWorkgroups(workgroupCount, workgroupCount);

            simulationStep++;
        }

        computePass.end();
    }

    async function updateGrid() {
        const encoder = device.createCommandEncoder();

        dispatchComputePass(encoder);

        // Start a render pass
        if (RENDERING_ENABLED) {
            const pass = encoder.beginRenderPass({
                colorAttachments: [
                    {
                        view: context.getCurrentTexture().createView(),
                        loadOp: "clear",
                        storeOp: "store",
                        clearValue: [0, 0, 0, 0],
                    },
                ],
            });
            // Draw the grid.
            pass.setPipeline(cellPipeline);
            pass.setVertexBuffer(0, vertexBuffer);

            pass.setBindGroup(0, bindGroups[simulationStep % 2]);

            pass.draw(
                vertices.length / 2,
                /*instances=*/ GRID_SIZE * GRID_SIZE
            );
            pass.end();
        }
        device.queue.submit([encoder.finish()]);
        await device.queue.onSubmittedWorkDone();
    }
}

export default sand_run_remake;

function _createVertexBuffer(device: GPUDevice) {
    const vertices = new Float32Array([
        -1.0, -1.0, 1.0, -1.0, 1.0, 1.0,

        -1.0, -1.0, 1.0, 1.0, -1.0, 1.0,
    ]);
    const vertexBuffer = device.createBuffer({
        label: "Cell vertices",
        size: vertices.byteLength,
        usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
    });
    device.queue.writeBuffer(vertexBuffer, 0, vertices);
    const vertexBufferLayout: GPUVertexBufferLayout = {
        arrayStride: vertices.BYTES_PER_ELEMENT * 2,
        attributes: [
            {
                format: "float32x2", //each vertex is 2 floats: (x,y)
                offset: 0,
                shaderLocation: 0,
            },
        ],
    };
    return { vertices, vertexBufferLayout, vertexBuffer };
}
