# Dark stair-steps off EOX coastlines

Seen 2026-11-05 while checking the launch-site regions: dark, blocky outlines in the water along the shore, stepped like coarse tile or mask cells. They are not new with those regions. Bora Bora, Sydney Heads and the Cape Peninsula show fainter versions, and Tanegashima is the strongest.

Not diagnosed. The strongest lead is the sea floor: `skadi` carries bathymetry (down to −5.7 km near Tanegashima), only the global band flattens water (`flattenWater`), and `surfaceTile/vertex.wesl` displaces by the height with no water clamp, so inside an EOX box the sea surface appears to sit on the sea floor. The same data leaves steps of up to 5.7 km against the flattened ocean at z3–z7 band edges, hidden only by skirts. Not tested.

Also rule out the land mask in the albedo alpha and the 2 km colour match, which treats land and water separately.

To reproduce, Tanegashima top-down from 5 km at local noon:

```
npm run shot -- 't=2026-06-21T03:16:00Z&pose=b,earth,0,0,0,-3606111.282312775,4152014.029200272,3226471.2800365402,-0.7549957681242345,-0.6557296623720001,-1.074140776324839e-14,0.3318213492960051,-0.3820533504394722,0.8625136692072494,0.5655757971005088,-0.6511941702007756,-0.5060337641211776' --hide-ui --hide-labels
```
