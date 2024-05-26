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
                data[offset + j].fire = 0;
                data[offset + j].wood = 0;
            }
        }


        fn getOffset(v: vec2u, offset: vec2i) -> vec2u {
            return vec2u(
                vec2i(v) + offset
            );
        }

        fn getState(x:u32, y:u32) -> Pixel {
            if (x >= u32(grid.x) || x < 0 || y >= u32(grid.y) || y < 0) {return Pixel(0,0);}
            return cellStateIn[cellIndex(vec2u(x,y))];

        }

        fn mooreIndex(i:u32, offset:vec2i) -> u32 {
            let offsetIndex = u32(offset.y+1) * 3 + u32(offset.x+1);
            return i*9 + offsetIndex;
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

            let state = getState(cell.x, cell.y);

            var fire = state.fire;

            let wood = state.wood;

            if (isCloseToZero(wood)) {
                var share_top = rand11(f32(i)*time*time);
                var share_top_left = rand11((f32(i)-time)*time*time) * 4;
                var share_top_right = rand11((f32(i)+time)*time*time) * 0.25;
    
                
    
                let share_sum = share_top + share_top_left + share_top_right;
    
                neighbourhood_intent[mooreIndex(i, vec2i(-1,1))].fire = fire * (share_top_left/share_sum);
                neighbourhood_intent[mooreIndex(i, vec2i(0,1))].fire = fire * (share_top/share_sum);
                neighbourhood_intent[mooreIndex(i, vec2i(1,1))].fire = fire * (share_top_right/share_sum);    
            }
            else if (wood < 25) {
                var sum_wood_neighbours = 0;
                for (var x = -1; x <= 1; x++) {
                    for (var y = -1; y <= 1; y++) {
                        let pos = getOffset(cell.xy, vec2i(x,y));
                        if (isCloseToZero(getState(pos.x, pos.y).wood)) {continue;}
                        sum_wood_neighbours++;
                    }
                }
                for (var x = -1; x <= 1; x++) {
                    for (var y = -1; y <= 1; y++) {
                        let pos = getOffset(cell.xy, vec2i(x,y));
                        if (isCloseToZero(getState(pos.x, pos.y).wood)) {continue;}
                        neighbourhood_intent[mooreIndex(i, vec2i(x, y))].fire = fire/f32(sum_wood_neighbours);
                    }
                }
                return;
            }
            else {
                neighbourhood_intent[mooreIndex(i, vec2i(0,0))].fire = fire;
                return;
            }

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
                    neighbourhood_maintain[mooreIndex(i, vec2i(x, y))].fire = neighbourhood_intent[mooreIndex(i_neighbour, vec2i(-x, -y))].fire;
                    neighbourhood_intent[mooreIndex(i_neighbour, vec2i(-x, -y))].fire = 0;
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
            var fire = 0f; 
            for (var x = -1; x <= 1; x++) {
                for (var y = -1; y <= 1; y++) {
                    if !isWithinBounds(cell.xy, grid) {continue;}
                    fire += neighbourhood_maintain[mooreIndex(i, vec2i(x, y))].fire;
                }
            }

            let randf = rand11(f32(i)*time) * 2;
            let randu1 = u32(round(randf));

            fire = max(0, fire - f32(randu1 & 1u));
            if (cell.y == 0) {fire = 36;}


            var wood = cellStateIn[i].wood;

            

            var woodBurntByFire = clamp(fire, 0, wood);


            if (!isCloseToZero(woodBurntByFire)) {
                wood -= woodBurntByFire;
                fire += log(woodBurntByFire);            
            }

            cellStateOut[i].fire = fire;
            cellStateOut[i].wood = wood;
        }
    `;
}
