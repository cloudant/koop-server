# koop-server
## A Node.js module for [Koop](https://github.com/Esri/Koop) 

koop-server is not meant to be run on its own. It provides the base models and utils needed to support the full [Koop](https://github.com/Esri/Koop) stack. This repo simply exposes an Express App that can be used as middleware within another Express app. This repo is meant to facilitate better modularity within Koop, and is used to test individual koop prodivers that are seperate NPM modules. 

## Dependencies 
The following dependencies are needed in order to run Koop on your local machine / server: 
* Node.js (version > 0.10.0) 
* PostgreSQL / PostGIS - In PostgreSQL 9.3 you can create a PostGIS enabled database by executing `CREATE EXTENSION postgis;` inside an existing database. 

## Installation
  ```npm install koop-server```

## Usage

  ```
    var express = require('express');
    var koop = require('koop-server')(config);
    var app = express();
    // add koop middleware
    app.use(koop);

    // rest of your express app setup 
  ```

## Tests 

    ```npm test```  


## Resources
* [Koop](https://github.com/Esri/Koop)
* [ArcGIS Developers](http://developers.arcgis.com)
* [ArcGIS REST Services](http://resources.arcgis.com/en/help/arcgis-rest-api/)
* [twitter@esri](http://twitter.com/esri)

## Issues
Find a bug or want to request a new feature?  Please let us know by submitting an issue.

## Contributing
Esri welcomes contributions from anyone and everyone. Please see our [guidelines for contributing](https://github.com/esri/contributing).

## Credit

## Licensing
Copyright 2014 Esri

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

   http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.

A copy of the license is available in the repository's [license.txt]( https://raw.github.com/Esri/koop-server/master/license.txt) file.

[](Esri Tags: ArcGIS Web Mapping GeoJson FeatureServices)
[](Esri Language: JavaScript)
