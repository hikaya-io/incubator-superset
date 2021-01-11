# How to add a Country Map

Country Maps are fetched from an NPM dependency of `superset-frontend` called `@superset-ui/legacy-plugin-chart-country-map`. This NPM package can be found [here](https://www.npmjs.com/package/@superset-ui/legacy-plugin-chart-country-map).

In order to add a new Country Map, we need to manually edit this package by adding the new GeoJSON and a few UI changes, so that the Country Map option would be displayed in its dropdown in Superset's UI.

1. Add you GeoJSON file in `superset-frontend/node_modules/@superset-ui/legacy-plugin-chart-country-map/esm/countries`

2. In `superset-frontend/node_modules/@superset-ui/legacy-plugin-chart-country-map/esm/controlPanel.js`, look for `controlSetRows.config.choices` entry, and add the name of your country to the array

3. In `superset-frontend/node_modules/@superset-ui/legacy-plugin-chart-country-map/esm/countries.js`, import you GeoJSON and add it to the exported object following the same pattern for the other GeoJSONs

4. Finally, rebuild the Superset frontend and restart Superset


## References

- [Official Superset documentation on how to add a Country Map](https://superset.apache.org/docs/miscellaneous/country-map-tools/): please note that this documentation is outdated
- [PR to improve Superset documentation on adding Country Maps](https://github.com/apache/incubator-superset/pull/10621/files): although this is an update, it is missing a crucial step (what step?????)
- [Superset issue & discussion on adding a new Country Map](https://github.com/apache/incubator-superset/issues/8819)