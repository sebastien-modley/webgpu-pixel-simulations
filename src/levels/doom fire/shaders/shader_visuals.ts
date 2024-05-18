import { pixelMaths } from "./shader_utils";

export default function shader_visuals(): string {
    return /* wgsl */ `

    //includes
    ${pixelMaths}

            @group(0) @binding(0) var<uniform> grid: vec2u;
            @group(0) @binding(1) var<storage> cellState: array<f32>;

            struct VertexInput {
                @location(0) pos: vec2f,
                @builtin(instance_index) instance: u32                
            };

            struct VertexOutput {
                @builtin(position) gridPos: vec4f,
                @location(0) @interpolate(flat) cell: vec2u,
                @location(1) state: f32
            };

            @vertex
            fn vertexMain(input: VertexInput) -> VertexOutput {
                let i = input.instance;
                let cell = vec2u(i%grid.x,i/grid.x);
                let state = cellState[input.instance];
                let isCellActive = !isCloseToZero(state);
                let gridf = vec2f(grid);

                let cellOffset = vec2f(cell) / gridf * 2;
                let gridPos = select(
                    vec2f(), 
                    (input.pos+1) / gridf - 1 + cellOffset, 
                    isCellActive
                );

                //make output
                var output: VertexOutput;
                output.gridPos = vec4f(gridPos,0,1);
                output.cell = cell;
                output.state = state;
                return output;
            }

            @fragment
            fn fragmentMain(
                @location(0) @interpolate(flat) cell: vec2u, 
                @location(1) state: f32
            ) -> @location(0) vec4f {
                let fireColor = calculateRawFireColor(state);
                return fireColor;
            }




            fn calculateRawFireColor(state: f32) -> vec4f {
                const checkPointCount = 4;
                const colors = array<vec4f, checkPointCount>(
                    vec4f(0.29, 0.1, 0.07, 1), 
                    vec4f(0.53, 0.17, 0.03, 1),
                    vec4f(0.96, 0.44, 0.12, 1), 
                    vec4f(0.98, 1, 0.7, 1), 
                );
                const checkPoints = array<f32, checkPointCount-1>(
                    10, 20, 30
                    // 0.05, 0.3, 1
                );

                var color = colors[0];
                for (var i = 1; i < checkPointCount; i++) {
                    if (state < checkPoints[i-1]) {break;}
                    color = colors[i];
                }
                return color;
            } 
        `;
}
