import { shader_data } from "./shader_data";
import { pixelMaths } from "./shader_utils";

export default function shader_visuals(): string {
    return /* wgsl */ `

        //includes
        ${pixelMaths}


        ${shader_data}

        struct VertexInput {
            @location(0) pos: vec2f,
            @builtin(instance_index) instance: u32                
        };

        struct VertexOutput {
            @builtin(position) gridPos: vec4f,
            @location(0) @interpolate(flat) cell: vec2u,
            @location(1) @interpolate(flat) cellIndex: u32
        };

        @vertex
        fn vertexMain(input: VertexInput) -> VertexOutput {
            let i = input.instance;
            let cell = vec2u(i%grid.x,i/grid.x);
            let state = cellStateIn[input.instance];
            let isCellActive = !isCloseToZero(state.fire) || state.wood > 0;
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
            output.cellIndex = i;
            return output;
        }

        @fragment
        fn fragmentMain(
            @location(0) @interpolate(flat) cell: vec2u, 
            @location(1) @interpolate(flat) cellIndex: u32
        ) -> @location(0) vec4f {
            let state = cellStateIn[cellIndex];
            let fireColor = calculateRawFireColor(state.fire);
            if (state.wood > 0) {
                return vec4f(0.6, 0.2, 0.2, 1f);
            }
            return fireColor;
        }




        fn calculateRawFireColor(state: f32) -> vec4f {
            const checkPointCount = 7;
            const colors = array<vec4f, checkPointCount>(
                vec4f(0.02f, 0.02f, 0.02f, 1f), 
                vec4f(0.37f, 0.1f, 0.02f, 1f),
                vec4f(0.62f, 0.22f, 0.02f, 1f),
                vec4f(0.65f, 0.4f, 0.05f, 1f),
                vec4f(0.62f, 0.47f, 0.1f, 1f),
                vec4f(0.57f, 0.57f, 0.17f, 1f), 
                vec4f(1f, 1f, 1f, 1f), 
            );
            const checkPoints = array<f32, checkPointCount-1>(
                12, 16, 19, 24, 32, 36
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
