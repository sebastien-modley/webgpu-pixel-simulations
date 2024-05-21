import { shader_data } from "./shader_data";
import { noiseMaths, randMaths } from "./shader_noise";
import { pixelMaths } from "./shader_utils";

export default function shader_simulation(
    device: GPUDevice,
    WORKGROUP_SIZE: number
) {
    return /* wgsl */ `
        //includes
        ${pixelMaths}
        ${noiseMaths}

        fn empty_array(
            data: ptr<storage, array<Pixel>, read_write>, 
            offset: u32, count: u32) {
            for (var j = 0u; j < count; j++) {
                data[offset + j].fireValue = 0;
                data[offset + j].isWood = 0;
            }
        }

        fn fireValue(x: u32, y: u32) -> f32 {
            if (x >= u32(grid.x) || x < 0 || y >= u32(grid.y) || y < 0) {return 1f;}
            return cellStateIn[cellIndex(vec2u(x,y))].fireValue;
        }

        fn getOffset(v: vec2u, offset: vec2i) -> vec2u {
            return vec2u(
                vec2i(v) + offset
            );
        }

        fn mooreIndex(i:u32, offset:vec2i) -> u32 {
            let offsetIndex = u32(offset.y+1) * 3 + u32(offset.x+1);
            return i*9 + offsetIndex;
        }

        fn isWood(x:u32, y:u32) -> bool {
            if (x >= u32(grid.x) || x < 0 || y >= u32(grid.y) || y < 0) {return false;}
            return cellStateIn[cellIndex(vec2u(x,y))].isWood == 1u;
        }

        ${shader_data}

        const numPossibilities = 3;
        const outgoingPossibilities = array<vec2i, numPossibilities>(
            vec2i(0,-1),
            vec2i(1,-1),
            vec2i(-1,-1),
        );


        @compute
        @workgroup_size(${WORKGROUP_SIZE}, ${WORKGROUP_SIZE}, 1)
        fn compute_push(
            @builtin(global_invocation_id) cell: vec3u
        ) {
            //setup
            let i = cellIndex(cell.xy);
            if !computeCellValid(cell, grid) {return;}

            empty_array(&neighbourhood_intent, i*9, 9);

            let randf = rand11(f32(i)*time) * 2;
            let randu1 = u32(round(randf));
            let randu2 = u32(round((randf - trunc(randf)) * 10));

            var fireValue = fireValue(cell.x, cell.y) * 1.0;
            fireValue = round(max(0, fireValue - f32(randu1 & 1u)));
            if (cell.y ==0) {fireValue = 36;}
            else if (isCloseToZero(fireValue)) {return;}
            else if (isWood(cell.x, cell.y)) {
                fireValue += 36;
            }





            var share_top = rand11(f32(i)*time*time);
            var share_top_left = rand11((f32(i)-time)*time*time) * 4;
            var share_top_right = rand11((f32(i)+time)*time*time) * 0.25;

            

            let share_sum = share_top + share_top_left + share_top_right;

            neighbourhood_intent[mooreIndex(i, vec2i(-1,1))].fireValue = fireValue * (share_top_left/share_sum);
            neighbourhood_intent[mooreIndex(i, vec2i(0,1))].fireValue = fireValue * (share_top/share_sum);
            neighbourhood_intent[mooreIndex(i, vec2i(1,1))].fireValue = fireValue * (share_top_right/share_sum);
        }

        @compute
        @workgroup_size(${WORKGROUP_SIZE}, ${WORKGROUP_SIZE}, 1)
        fn compute_pull(
            @builtin(global_invocation_id) cell: vec3u
        ) {
            //setup
            let i = cellIndex(cell.xy);
            if !computeCellValid(cell, grid) {return;}
    
            empty_array(&neighbourhood_maintain, i*9, 9);

            for (var x = -1; x <= 1; x++) {
                for (var y = -1; y <= 1; y++) {
                    let i_neighbour = cellIndex(getOffset(cell.xy, vec2i(x, y)));
                    neighbourhood_maintain[mooreIndex(i, vec2i(x, y))].fireValue = neighbourhood_intent[mooreIndex(i_neighbour, vec2i(-x, -y))].fireValue;
                    neighbourhood_intent[mooreIndex(i_neighbour, vec2i(-x, -y))].fireValue = 0;
                }
            }

        }

        @compute
        @workgroup_size(${WORKGROUP_SIZE}, ${WORKGROUP_SIZE}, 1)
        fn compute_update(
            @builtin(global_invocation_id) cell: vec3u
        ) {
            //setup
            let i = cellIndex(cell.xy);
            if !computeCellValid(cell, grid) {return;}

            //sum leftover outgoing intent and accepted incoming intent
            var sum = 0f; 
            for (var x = -1; x <= 1; x++) {
                for (var y = -1; y <= 1; y++) {
                    if !isWithinBounds(cell.xy, grid) {continue;}
                    sum += neighbourhood_maintain[mooreIndex(i, vec2i(x, y))].fireValue;
                }
            }

            cellStateOut[i].fireValue = sum;
            cellStateOut[i].isWood = cellStateIn[i].isWood;
            if (cellStateIn[i].isWood == 1u && !isCloseToZero(cellStateIn[i].fireValue)) {
                    cellStateOut[i].isWood = 0u;
            }
        }
    `;
}
