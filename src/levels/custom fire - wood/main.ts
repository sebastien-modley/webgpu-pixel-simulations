import {
    ArrayDefinition,
    StructDefinition,
    StructuredView,
    TextureDefinition,
    isTypedArray,
    makeShaderDataDefinitions,
    makeStructuredView,
} from "webgpu-utils";
import { StatLogger } from "../../utils/StatLogger";
import shader_simulation from "./shaders/shader_sim";
import shader_visuals from "./shaders/shader_visuals";
import { shader_data } from "./shaders/shader_data";
import { Pane } from "tweakpane";
import {
    BindingApi,
    BladeApi,
    BladeController,
    FolderApi,
    View,
} from "@tweakpane/core";
import shader_vertex_fragment from "./shaders/shader_vertex_fragment";

const shaderInputNameCorrector = (inputName: string) =>
    inputName.replaceAll(" ", "_");

const GRID_SIZE = 256;
const UPDATE_INTERVAL_MS = (fps) => 1000 / fps;
const WORKGROUP_SIZE = 4;
const LOG_EVERY_X_FRAMES = 120;
const RENDERING_ENABLED = true;

const statLogger = new StatLogger(LOG_EVERY_X_FRAMES);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const PANE_FIRE_BEHAVIOUR_PARAMS = {
    "ground fire power": 16,
    "mouse torch power": 36,
    "noise A": 1.2,
    "noise B": 1.09,
    "focus A": 1.0,
    "focus B": 2.0,
    spread: 0,
};

const SIM_PARAMS = {
    "updates / frame": 2,
    fps: 30,
};

let FIRE_COLOUR_PARAMS: {
    checkpoints: {
        colour: { r: number; g: number; b: number; a: number };
        checkpoint: number;
    }[];
    count: number;
    maxCount: number;
} = {
    checkpoints: [
        { colour: { r: 0.07, g: 0.07, b: 0.07, a: 0.51 }, checkpoint: 0.1 },
        { colour: { r: 0.42, g: 0.11, b: 0.02, a: 0.65 }, checkpoint: 1 },
        { colour: { r: 0.57, g: 0.2, b: 0.03, a: 0.9 }, checkpoint: 5 },
        { colour: { r: 0.65, g: 0.38, b: 0.02, a: 1.0 }, checkpoint: 8 },
        { colour: { r: 0.75, g: 0.51, b: 0.22, a: 1.0 }, checkpoint: 13 },
        { colour: { r: 0.81, g: 0.65, b: 0.39, a: 1.0 }, checkpoint: 21 },
    ],
    count: 6,
    maxCount: 20,
};

var mousePosition = [-1, -1];
var mouseDown = false;

async function run(
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

    const fireSettingsFolder = pane.addFolder({ title: "Fire settings" });
    fireSettingsFolder.addBinding(
        PANE_FIRE_BEHAVIOUR_PARAMS,
        "ground fire power",
        {
            min: 0,
            max: 100,
            step: 0.1,
        }
    );
    fireSettingsFolder.addBinding(
        PANE_FIRE_BEHAVIOUR_PARAMS,
        "mouse torch power",
        {
            min: 0,
            max: 100,
            step: 0.1,
        }
    );
    fireSettingsFolder.addBinding(PANE_FIRE_BEHAVIOUR_PARAMS, "noise A", {
        min: 0,
        max: 5,
        step: 0.1,
    });
    fireSettingsFolder.addBinding(PANE_FIRE_BEHAVIOUR_PARAMS, "noise B", {
        min: 0,
        max: 5,
        step: 0.01,
    });

    fireSettingsFolder.addBinding(PANE_FIRE_BEHAVIOUR_PARAMS, "focus A", {
        min: 0,
        max: 10,
        step: 0.1,
    });

    fireSettingsFolder.addBinding(PANE_FIRE_BEHAVIOUR_PARAMS, "focus B", {
        min: 0,
        max: 10,
        step: 0.1,
    });

    fireSettingsFolder.addBinding(PANE_FIRE_BEHAVIOUR_PARAMS, "spread", {
        min: 0,
        max: 2,
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

    const fireColourSettingsFolder = pane.addFolder({
        title: "Fire colour settings",
    });
    const fireColourCheckpointPanes: {
        folder: FolderApi;
        colour: BindingApi<any>;
        checkpoint: BindingApi<any>;
    }[] = [];

    const handleCheckpointChange = (i: number, value: number) => {
        FIRE_COLOUR_PARAMS.checkpoints[i].checkpoint = value;
        [i - 1, i + 1].forEach((idx) => {
            if (idx < 0 || idx >= FIRE_COLOUR_PARAMS.count) return;
            console.log(i, idx, fireColourCheckpointPanes);
            const panes = fireColourCheckpointPanes[idx];
            panes.folder.remove(panes.colour);
            panes.folder.remove(panes.checkpoint);

            const { colour, checkpoint } = createColourCheckpointSettings(
                idx,
                idx == FIRE_COLOUR_PARAMS.count - 1,
                panes.folder
            );
            panes.colour = colour;
            panes.checkpoint = checkpoint;
        });
    };

    const handleCheckpointCountChange = (newCount: number) => {
        {
            for (
                let i = FIRE_COLOUR_PARAMS.checkpoints.length;
                i < newCount;
                i++
            ) {
                FIRE_COLOUR_PARAMS.checkpoints.push(
                    structuredClone(
                        FIRE_COLOUR_PARAMS.checkpoints[
                            FIRE_COLOUR_PARAMS.checkpoints.length - 1
                        ]
                    )
                );
            }
            FIRE_COLOUR_PARAMS.checkpoints.forEach((e, i) => {
                if (
                    i > 0 &&
                    e.checkpoint <=
                        FIRE_COLOUR_PARAMS.checkpoints[i - 1].checkpoint
                ) {
                    e.checkpoint =
                        FIRE_COLOUR_PARAMS.checkpoints[i - 1].checkpoint + 5;
                }
            });
            fireColourCheckpointPanes
                .splice(Math.max(0, newCount - 1))
                .forEach((panes) =>
                    fireColourSettingsFolder.remove(panes.folder)
                );
            fireColourCheckpointPanes.forEach((panes, idx) => {
                panes.folder.remove(panes.checkpoint);
                panes.checkpoint = createCheckpointBinding(
                    idx,
                    idx == newCount - 1,
                    panes.folder
                );
            });
            for (let i = fireColourCheckpointPanes.length; i < newCount; i++) {
                console.log(i, i == newCount - 1);
                addColourSettings(i, i == newCount - 1);
            }
            console.log(FIRE_COLOUR_PARAMS);
        }
    };

    const createCheckpointBinding = (
        i: number,
        isLast: boolean,
        folder: FolderApi
    ) => {
        const checkpoint = folder
            .addBinding(FIRE_COLOUR_PARAMS.checkpoints[i], "checkpoint", {
                min:
                    i == 0
                        ? 0
                        : FIRE_COLOUR_PARAMS.checkpoints[i - 1].checkpoint + 1,
                max: isLast
                    ? 1000
                    : FIRE_COLOUR_PARAMS.checkpoints[i + 1].checkpoint - 1,
                step: 1,
            })
            .on("change", (ev) => {
                handleCheckpointChange(i, ev.value);
            });
        return checkpoint;
    };

    const createColourCheckpointSettings = (
        i: number,
        isLast: boolean,
        folder: FolderApi
    ) => {
        const colour = folder.addBinding(
            FIRE_COLOUR_PARAMS.checkpoints[i],
            "colour",
            { picker: "inline", color: { type: "float" } }
        );
        const checkpoint = createCheckpointBinding(i, isLast, folder);
        return { colour, checkpoint };
    };

    const addColourSettings = (i: number, isLast: boolean = false) => {
        const folder = fireColourSettingsFolder.addFolder({
            title: `Checkpoint ${i}`,
        });
        const { colour, checkpoint } = createColourCheckpointSettings(
            i,
            isLast,
            folder
        );
        fireColourCheckpointPanes.push({
            folder: folder,
            colour: colour,
            checkpoint: checkpoint,
        });
    };

    fireColourSettingsFolder
        .addBinding(FIRE_COLOUR_PARAMS, "count", {
            step: 1,
            min: 1,
            max: FIRE_COLOUR_PARAMS.maxCount,
        })
        .on("change", (ev) => handleCheckpointCountChange(ev.value));

    handleCheckpointCountChange(FIRE_COLOUR_PARAMS.count);

    // fireColourSettingsFolder.addBinding(FIRE_COLOUR_PARAMS, "checkpoints", {
    //     // view: "color",
    //     color: {},
    //     expanded: true,
    //     picker: "inline",
    // });

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
        fireColourCheckpoints: new ArrayBuffer(
            (
                shaderDefs.storages["fireColourCheckpoints"]
                    .typeDefinition as ArrayDefinition
            ).elementType.size * FIRE_COLOUR_PARAMS.maxCount
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
        fireBehaviour: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
        // ...Object.assign(
        //     {} as { [key: string]: number },
        //     ...Object.keys(PANE_FIRE_BEHAVIOUR_PARAMS).map((key) => {
        //         return {
        //             ["FIRE_BEHAVIOUR__" + shaderInputNameCorrector(key)]:
        //                 GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
        //         };
        //     })
        // ),
        mouse_data: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
        fireColourCheckpointsCount:
            GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
        fireColourCheckpoints: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
        simulationVisualsIn: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
        simulationVisualsOut: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
        updatesInFrame: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
        bindingTag: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    };
    console.log(shaderDataUsages);

    shaderDataObjects.grid.set([GRID_SIZE, GRID_SIZE]);
    shaderDataObjects.time.set(window.performance.now());
    const cellStartData = Array(GRID_SIZE * GRID_SIZE);
    for (let x = 0; x < GRID_SIZE; x++) {
        cellStartData[(GRID_SIZE - 1) * GRID_SIZE + x] = {
            fire: 36,
        };
    }
    for (let x = 0; x < GRID_SIZE; x++) {
        for (
            let y = (GRID_SIZE * 3) / 4 - 10;
            y < (GRID_SIZE * 3) / 4 + 10;
            y++
        ) {
            cellStartData[y * GRID_SIZE + x] = {
                wood: 100,
            };
        }
    }

    shaderDataObjects["cellStateIn"].set(cellStartData);
    shaderDataObjects["mouse_data"].set({ pos: mousePosition, down: false });
    shaderDataObjects["fireColourCheckpointsCount"].set(
        FIRE_COLOUR_PARAMS.maxCount
    );
    shaderDataObjects["fireColourCheckpoints"].set([
        FIRE_COLOUR_PARAMS.checkpoints,
    ]);

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
                binding: shaderDefs.uniforms["time"].binding,
                visibility: GPUShaderStage.COMPUTE | GPUShaderStage.FRAGMENT,
                buffer: {}, // time uniform buffer
            },
            {
                binding: shaderDefs.uniforms["fireBehaviour"].binding,
                visibility: GPUShaderStage.COMPUTE,
                buffer: {},
            },
            // ...Object.keys(PANE_FIRE_BEHAVIOUR_PARAMS).map((key) => {
            //     return {
            //         binding:
            //             shaderDefs.uniforms[
            //                 "FIRE_BEHAVIOUR__" + shaderInputNameCorrector(key)
            //             ].binding,
            //         visibility: GPUShaderStage.COMPUTE,
            //         buffer: {},
            //     };
            // }),

            {
                binding: shaderDefs.uniforms["mouse_data"].binding,
                visibility: GPUShaderStage.COMPUTE,
                buffer: {},
            },
            {
                binding:
                    shaderDefs.uniforms["fireColourCheckpointsCount"].binding,
                visibility: GPUShaderStage.COMPUTE,
                buffer: {},
            },
            {
                binding: shaderDefs.storages["fireColourCheckpoints"].binding,
                visibility: GPUShaderStage.COMPUTE,
                buffer: { type: "read-only-storage" },
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
                    binding: shaderDefs.uniforms["time"].binding,
                    resource: { buffer: shaderDataBuffers.time },
                },
                {
                    binding: shaderDefs.uniforms["fireBehaviour"].binding,
                    resource: { buffer: shaderDataBuffers.fireBehaviour },
                },
                // ...Object.keys(PANE_FIRE_BEHAVIOUR_PARAMS).map((key) => {
                //     return {
                //         binding:
                //             shaderDefs.uniforms[
                //                 "FIRE_BEHAVIOUR__" +
                //                     shaderInputNameCorrector(key)
                //             ].binding,
                //         resource: {
                //             buffer: shaderDataBuffers[
                //                 "FIRE_BEHAVIOUR__" +
                //                     shaderInputNameCorrector(key)
                //             ],
                //         },
                //     };
                // }),

                {
                    binding: shaderDefs.uniforms["mouse_data"].binding,
                    resource: { buffer: shaderDataBuffers.mouse_data },
                },
                {
                    binding:
                        shaderDefs.uniforms["fireColourCheckpointsCount"]
                            .binding,
                    resource: {
                        buffer: shaderDataBuffers.fireColourCheckpointsCount,
                    },
                },
                {
                    binding:
                        shaderDefs.storages["fireColourCheckpoints"].binding,
                    resource: {
                        buffer: shaderDataBuffers.fireColourCheckpoints,
                    },
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
                    binding: shaderDefs.uniforms["time"].binding,
                    resource: { buffer: shaderDataBuffers.time },
                },
                {
                    binding: shaderDefs.uniforms["fireBehaviour"].binding,
                    resource: { buffer: shaderDataBuffers.fireBehaviour },
                },
                // ...Object.keys(PANE_FIRE_BEHAVIOUR_PARAMS).map((key) => {
                //     return {
                //         binding:
                //             shaderDefs.uniforms[
                //                 "FIRE_BEHAVIOUR__" +
                //                     shaderInputNameCorrector(key)
                //             ].binding,
                //         resource: {
                //             buffer: shaderDataBuffers[
                //                 "FIRE_BEHAVIOUR__" +
                //                     shaderInputNameCorrector(key)
                //             ],
                //         },
                //     };
                // }),

                {
                    binding: shaderDefs.uniforms["mouse_data"].binding,
                    resource: { buffer: shaderDataBuffers.mouse_data },
                },
                {
                    binding:
                        shaderDefs.uniforms["fireColourCheckpointsCount"]
                            .binding,
                    resource: {
                        buffer: shaderDataBuffers.fireColourCheckpointsCount,
                    },
                },
                {
                    binding:
                        shaderDefs.storages["fireColourCheckpoints"].binding,
                    resource: {
                        buffer: shaderDataBuffers.fireColourCheckpoints,
                    },
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
    function dispatchComputePass(encoder: GPUCommandEncoder) {
        const workgroupCount = Math.ceil(GRID_SIZE / WORKGROUP_SIZE);
        const computePass = encoder.beginComputePass();

        const timeData = new Float32Array([window.performance.now()]);
        device.queue.writeBuffer(shaderDataBuffers.time, 0, timeData);

        shaderDataObjects["mouse_data"].set({
            pos: mousePosition,
            down: mouseDown ? 1 : 0,
        });
        device.queue.writeBuffer(
            shaderDataBuffers.mouse_data,
            0,
            shaderDataObjects["mouse_data"].arrayBuffer
        );

        shaderDataObjects["fireColourCheckpointsCount"].set(
            FIRE_COLOUR_PARAMS.count
        );
        device.queue.writeBuffer(
            shaderDataBuffers["fireColourCheckpointsCount"],
            0,
            shaderDataObjects["fireColourCheckpointsCount"].arrayBuffer
        );
        const check = Array(FIRE_COLOUR_PARAMS.maxCount);
        FIRE_COLOUR_PARAMS.checkpoints.forEach(
            (e, i) =>
                (check[i] = {
                    checkpoint: e.checkpoint,
                    colour: [e.colour.r, e.colour.g, e.colour.b, e.colour.a],
                })
        );
        shaderDataObjects["fireColourCheckpoints"].set(check);
        device.queue.writeBuffer(
            shaderDataBuffers["fireColourCheckpoints"],
            0,
            shaderDataObjects["fireColourCheckpoints"].arrayBuffer
        );
        shaderDataObjects["fireBehaviour"].set({
            ground_fire_power: PANE_FIRE_BEHAVIOUR_PARAMS["ground fire power"],
            mouse_torch_power: PANE_FIRE_BEHAVIOUR_PARAMS["mouse torch power"],
            noise_A: PANE_FIRE_BEHAVIOUR_PARAMS["noise A"],
            noise_B: PANE_FIRE_BEHAVIOUR_PARAMS["noise B"],
            focus_A: PANE_FIRE_BEHAVIOUR_PARAMS["focus A"],
            focus_B: PANE_FIRE_BEHAVIOUR_PARAMS["focus B"],
            spread: PANE_FIRE_BEHAVIOUR_PARAMS["spread"],
        });
        device.queue.writeBuffer(
            shaderDataBuffers["fireBehaviour"],
            0,
            shaderDataObjects["fireBehaviour"].arrayBuffer
        );
        // Object.keys(PANE_FIRE_BEHAVIOUR_PARAMS).forEach((key) => {
        //     let valueToWrite = new Float32Array([
        //         PANE_FIRE_BEHAVIOUR_PARAMS[key],
        //     ]);
        //     device.queue.writeBuffer(
        //         shaderDataBuffers[
        //             `FIRE_BEHAVIOUR__${shaderInputNameCorrector(key)}`
        //         ],
        //         0,
        //         valueToWrite
        //     );
        // });

        shaderDataObjects["updatesInFrame"].set([0, 0]);
        device.queue.writeBuffer(
            shaderDataBuffers["updatesInFrame"],
            0,
            shaderDataObjects["updatesInFrame"].arrayBuffer
        );

        var updates = SIM_PARAMS["updates / frame"];
        for (let i = 0; i < updates; i++) {
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

export default run;

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
