var _ = require('lodash'),
  sql = require('simple-sql-parser'),
  pg = require('pg');

var sm = require('sphericalmercator'),
  merc = new sm({size:256});

module.exports = {
  infoTable: 'koopinfo', 
  timerTable: 'kooptimers',
  limit: 10000,

  connect: function( conn, callback ){
    var self = this;
    // save the connection string
    this.conn = conn;

    this.client = new pg.Client( conn );
    this.client.connect(function(err) {
      if ( err ){
        console.log('Could not connect to the database');
        process.exit();
      } else {
        // creates table only if they dont exist
        self._createTable(self.infoTable, "( id varchar(255) PRIMARY KEY, info JSON)", null);
        self._createTable(self.timerTable, "( id varchar(255) PRIMARY KEY, expires varchar(25))", null);
      }
      if ( callback ){
        callback();
      }
    });
    return this; 
  },

  // returns the info doc for a key 
  getCount: function( key, callback ){
    this._query('select count(*) as count from "'+key+'"', function(err, result){
      if ( err || !result || !result.rows || !result.rows.length ){
        callback('Key Not Found ' + key, null);
      } else {
        callback(null, parseInt(result.rows[0].count));
      }
    });
  },

  // returns the info doc for a key 
  getInfo: function( key, callback ){
    this._query('select info from "'+this.infoTable+'" where id=\''+key+":info\'", function(err, result){
      if ( err || !result || !result.rows || !result.rows.length ){
        callback('Key Not Found ' + key, null);
      } else {
        var info = result.rows[0].info;
        callback(null, info);
      }
    });
  },

  // updates the info doc for a key 
  updateInfo: function( key, info, callback ){
    this._query("update " + this.infoTable + " set info = '" + JSON.stringify(info) + "' where id = '"+key+":info'", function(err, result){
      if ( err || !result ){
        callback('Key Not Found ' + key, null);
      } else {
        callback(null, true);
      }
    });
  },


  oneFilter: function( clause ){
    var left = ' (feature->\'properties\'->>\''+clause.left.replace(/'/g,'')+'\')';
    if (parseInt(clause.right)){
      left += '::float::int';
    }
    return left +' '+ clause.operator + ' \'' + clause.right.replace(/'/g,'') + '\''; 
  },

  orFilter: function( select, clause ){
      if ( clause.left.operator.toLowerCase() == 'like' || clause.left.operator.toLowerCase() == '='){
        select += this.oneFilter( clause.left );
      } else if (clause.left.operator.toLowerCase() == 'or'){
        select = this.orFilter( select, clause.left );
      }
       
      if ( clause.right.operation.toLowerCase() == 'like' || clause.right.operator.toLowerCase() == '='){
        select += ' OR ' + this.oneFilter( clause.right );
      } 
    return select;
  },

  parseWhere: function( where){
    if ( where.operator.toLowerCase() == 'like' || _.indexOf(['=','<','>','<=','>='], where.operator) != -1){
      return this.oneFilter( where );
    } else if ( where.operator.toLowerCase() == 'or'){
      //return this.orFilter( select, where.terms ); 
    }
  }, 

  parseLogic: function( where ){
    var clause = [];
    for (var i = 0; i < where.terms.length; i++){
      if (where.terms[i].logic){
        clause.push( '(' + this.parseLogic(where.terms[i]) + ')');
      } else {
        clause.push( this.parseWhere(where.terms[i]) );
      }
    }
    clause = clause.join(' '+where.logic+' ');
    return clause;
  },
  
  // get data out of the db
  select: function(key, options, callback){
    var self = this;
    //var layer = 0;
    var error = false,
      totalLayers,
      queryOpts = {}, 
      allLayers = [];

    // closure to check each layer and send back when done
    var collect = function(err, data){
      if (err) error = err;
      allLayers.push(data);
      if (allLayers.length == totalLayers){
        callback(error, allLayers);
      }
    };
          
    this._query('select info from "'+this.infoTable+'" where id=\''+(key+':'+(options.layer || 0 )+":info")+'\'', function(err, result){
      if ( err || !result || !result.rows || !result.rows.length ){
        callback('Not Found', []);
      } else if (result.rows[0].info.status == 'processing' && !options.bypassProcessing ) {
        callback( null, [{ status: 'processing' }]);
      } else {
          var info = result.rows[0].info;
          var select = 'select feature from "' + key+':'+(options.layer || 0)+'"'; 
  
          // parse the where clause 
          if ( options.where && options.where != '1=1'){
            var where = sql.sql2ast('select * from foo where '+ options.where.replace(/like/g, '=').replace(/\%/g,'')).WHERE;
            var clause = '';
            if ( where.logic ){
              clause = self.parseLogic( where );
            } else {
              clause += self.parseWhere(where);
            }
            select += ' WHERE ' + clause;
          }

          // parse the geometry param from GeoServices REST
          if ( options.geometry ){
            if ( typeof(options.geometry) == 'string' ){
              try {
                options.geometry = JSON.parse( options.geometry );
              } catch(e){
                console.log('Error parsing options.geometry, splitting string', options.geometry);
                try {
                  if ( options.geometry.split(',').length == 4 ){
                    var extent = options.geometry.split(',');
                    options.geometry = { spatialReference: {wkid: 4326} }; 
                    options.geometry.xmin = extent[0];
                    options.geometry.ymin = extent[1];
                    options.geometry.xmax = extent[2];
                    options.geometry.ymax = extent[3];
                  }
                } catch(error){
                  console.log('Error building bbox from', options.geometry);
                }
              }
            }

            if (options.geometry.xmin && options.geometry.ymin ){
              var box = options.geometry;
              if (box.spatialReference.wkid != 4326){
                var mins = merc.inverse( [box.xmin, box.ymin] ),
                  maxs = merc.inverse( [box.xmax, box.ymax] );
                box.xmin = mins[0];
                box.ymin = mins[1];
                box.xmax = maxs[0];
                box.ymax = maxs[1];
              }

              select += (options.where ) ? ' AND ' : ' WHERE ';
              select += 'ST_Intersects(ST_GeomFromGeoJSON(feature->>\'geometry\'), ST_MakeEnvelope('+box.xmin+','+box.ymin+','+box.xmax+','+box.ymax+'))';
            }
          }

          self._query( select.replace(/ feature /, ' count(*) as count '), function(err, result){ 
            if (!options.limit && !err && result.rows.length && result.rows[0].count > self.limit ){
              callback( null, [{
                status: 'too big',
                type: 'FeatureCollection',
                features: [{}],
                name: info.name,
                sha: info.sha,
                info: info.info,
                updated_at: info.updated_at
              }]);

            } else {
              if ( options.limit ) {
                select += ' LIMIT ' + options.limit;
              }
              if ( options.offset ) {
                select += ' OFFSET ' + options.offset;
              }
              console.log(select);
              self._query( select, function (err, result) {
                if ( result && result.rows && result.rows.length ) {
                  callback( null, [{
                    type: 'FeatureCollection', 
                    features: _.pluck(result.rows, 'feature'),
                    name: info.name, 
                    sha: info.sha, 
                    info: info.info, 
                    updated_at: info.updated_at 
                  }]);
                } else {
                  callback( 'Not Found', [{
                    type: 'FeatureCollection',
                    features: []
                  }]);
                }
              });
            }
          });
        }
    });
  },

  // create a collection and insert features
  // create a 2d index 
  insert: function( key, geojson, layerId, callback ){
    var self = this; 
    var info = {},
      count = 0;
      error = null;
      
      info.name = geojson.name ;
      info.updated_at = geojson.updated_at;
      info.expires_at = geojson.expires_at;
      info.retrieved_at = geojson.retrieved_at;
      info.status = geojson.status;
      info.format = geojson.format;
      info.sha = geojson.sha;
      info.info = geojson.info;
   
      var table = key+':'+layerId;

      var feature = (geojson[0]) ? geojson[0].features[0] : geojson.features[0];

      if (!feature){
        feature = { geometry: { type: geojson.geomType } };
      }

      self._createTable( table, self._buildSchemaFromFeature(feature), false, function(err, result){

        // insert each feature
        if ( geojson.length ){
          geojson = geojson[0];
        }
        geojson.features.forEach(function(feature, i){
          self._query(self._insertFeature(table, feature, i));
        });

        // TODO Why not use an update query here? 
        self._query( 'delete from "'+self.infoTable+'" where id=\''+table+':info\'', function(err,res){
          self._query( 'insert into "'+self.infoTable+'" values (\''+table+':info\',\''+JSON.stringify(info).replace(/'/g,'')+'\')', function(err, result){
            callback(err, true);
          });
        });
      });     
    
  },

  insertPartial: function( key, geojson, layerId, callback ){
    var self = this;
    var info = {};

    var sql = 'BEGIN;';
    var table = key+':'+layerId;
    geojson.features.forEach(function(feature, i){
        sql += self._insertFeature(table, feature, i);
    });
    sql += 'COMMIT;';
    this._query(sql, function(err, res){
      callback(null, true);
    });
  },

  // inserts geojson features into the feature column of the given table
  _insertFeature: function(table, feature, i){
    return 'insert into "'+table+'" (feature) VALUES (\''+JSON.stringify(feature).replace(/'/g, "").replace(/\(\)/g,'')+'\');';
   // return 'insert into "'+table+'" (feature, geom) VALUES (\''+JSON.stringify(feature).replace(/'/g, "")+'\', ST_GeographyFromText(ST_AsText(ST_GeomFromGeoJSON(\''+JSON.stringify(feature.geometry)+'\'))));' ;
  },


  remove: function( key, callback){
    var self = this;
  
    this._query('select info from "'+this.infoTable+'" where id=\''+(key+":info")+"'", function(err, result){
      if ( !result || !result.rows.length ){
        // nothing to remove
        callback( null, true );
      } else {
        var info = result.rows[0].info;
        self.dropTable(key, function(err, result){
            self._query("delete from \""+self.infoTable+"\" where id='"+(key+':info')+"'", function(err, result){
              if (callback) callback( err, true);
            });
        });
      }
    });
  },

  dropTable: function(table, callback){
    this._query('drop table "'+table+'"' , callback);
  },

  services: { 
    register: function( type, info, callback){
      PostGIS._createTable(type, '( id varchar(100), host varchar(100))', null, function(err, result){
        PostGIS._query('select * from "'+type+'" where id=\''+info.id+"\'", function(err, res){
          if ( err || !res || !res.rows || !res.rows.length ) {
            var sql = 'insert into "'+type+'" (id, host) VALUES (\''+info.id+'\', \''+info.host+'\')' ;
            PostGIS._query(sql, function(err, res){
              callback( err, true );
            });
          } else {
            callback( err, true );
          }
        });  
      });
    },

    count: function( type, callback){
      var sql = 'select count(*) as count from "'+type+'"';
      PostGIS._query(sql, function(err, res){
        if (err || !res || !res.rows || !res.rows.length){
          callback( err, 0 );
        } else {
          callback( err, res.rows[0].count );
        }
      });
    },

    remove: function( type, id, callback){
      var sql = 'delete from "'+type+'" where id=\''+id+"'";
      PostGIS._query(sql, function(err, res){
        callback( err, true );
      });
    },

    get: function( type, id, callback){
      var sql;
      PostGIS._createTable(type, '( id varchar(100), host varchar(100))', null, function(err, result){
        if (!id) {
          sql = 'select * from "'+type+'"';
          PostGIS._query(sql, function(err, res){
            callback( err, res.rows);
          });
        } else {
          sql = 'select * from "'+type+'" where id=\''+id+"\'";
          PostGIS._query(sql, function(err, res){
            if (err || !res || !res.rows || !res.rows.length){
              err = 'No service found by that id';
              callback( err, null);
            } else {
              callback( err, res.rows[0]);
            }
          });
        }
      });
    }
  },

  timer: {
    set: function(key, expires, callback){
      var now = new Date();
      var expires_at = new Date( now.getTime() + expires );
      PostGIS._query('delete from "'+ PostGIS.timerTable +'" WHERE id=\''+key+"\'", function(err,res){
        PostGIS._query('insert into "'+ PostGIS.timerTable +'" (id, expires) VALUES (\''+key+'\', \''+expires_at.getTime()+'\')', function(err, res){
          callback( err, res);
        });
      });
    },
    get: function(key, callback){
      PostGIS._query('select * from "'+ PostGIS.timerTable + '" where id=\''+key+"\'", function(err, res){
        if (err || !res || !res.rows || !res.rows.length ){
          callback( err, null);
        } else {
          if ( new Date().getTime() < parseInt( res.rows[0].expires )){
            callback( err, res.rows[0]);
          } else {
            callback( err, null);
          }
        }
      });
    }
  },


  //--------------
  // PRIVATE METHODS
  //-------------

  _query: function(sql, callback){
    pg.connect(this.conn, function(err, client, done) {
      if(err) {
        return console.error('error fetching client from pool', err);
      }
      client.query(sql, function(err, result) {
        //call `done()` to release the client back to the pool
        done();
        if ( callback ) {
          callback(err, result);
        }
      });
    });

  },


  // checks to see in the info table exists, create it if not
  _createTable: function(name, schema, index, callback){
    var self = this;
    var sql = "select exists(select * from information_schema.tables where table_name='"+ name +"')";
    this._query(sql, function(err, result){
      if ( !err || !result || !result.rows[0].exists ){
        var create = "CREATE TABLE \"" + name + "\" " + schema;
        self._query(create, function(err, result){
            if ( index ){
              self._query( 'CREATE INDEX '+name.replace(/:/g,'')+'_gix ON "'+name+'" USING GIST ( geom )', function(err){
                if (callback) {
                  callback();
                }
              });
            } else {
              if (callback) {
                callback();
              }
            }
        });
      } else if (callback){
        callback();
      }
    });
  },

  _buildSchemaFromFeature: function(feature){
    var schema = '(';
    var props = ['id SERIAL PRIMARY KEY', 'feature JSON', 'geom geography']; //('+feature.geometry.type.toUpperCase()+')'];
    schema += props.join(',') + ')';
    return schema;
  }

};
