var fs = require('fs'),
  child = require('child_process'),
  path = require('path');

exports.insert = function( type, key, data, layerId, callback ){
  Cache.db.insert( type+':'+key, data, layerId, function(err, success){
    Cache.db.timer.set( type+':'+key+':timer', 3600000, function( error, timer){
      callback( err, success );
    });
  });
};

exports.insertPartial = function( type, key, data, layerId, callback ){
  Cache.db.insertPartial( type+':'+key, data, layerId, function(err, success){
    callback( err, success );
  });
};


// handles the response from the select
// if a cache timer has expired we ask if the data in the 3rd party API has changed 
// if it has changed then each Model's checkCache function will return the NEW data 
// if it hasnt changed then checkCache will return false and the old data will be sent back   
exports.process = function( type, key, data, options, callback ){
  var self = this;
  // timing at which we'll check the validity of the cache 
  var checkTime = (60*60*1000); // 60 mins 

  if ( !data.length ){
    callback( 'Not found', null);
  } else {
    // checks the timer 
    var timerKey = [type, key, (options.layer || 0), 'timer'].join(':');
    Cache.db.timer.get( timerKey, function( error, timer){
      if ( timer ){
        // got a timer, therefore we are good and just return
        callback( null, data );
      } else {
        // expired, hit the API to check the latest sha
        if ( global[type] && global[type].checkCache ) {
          global[type].checkCache( key, data, options, function(err, success){
            if ( !success ){
              // false is good -> reset timer and return data
              // cache returned true, return current data
              Cache.db.timer.set( timerKey, checkTime, function( error, timer){
                callback( null, data );
              });
            } else {
              // we need to remove and save new data 
              self.remove(type, key, options, function(){
                self.insert(type, key, data, (options.layer || 0), function(err, res){
                  Cache.db.timer.set( timerKey, checkTime, function( error, timer){
                    callback( err, success );
                  });
                });
              });
            } 
          });
        } else {
          callback( null, data ); 
        }
      }
    });
  }
};

exports.remove = function(type, key, options, callback){
  var self = this;
  Cache.db.remove( type+':'+key+':'+(options.layer || 0), function(err, result){
    // Remove all files
    self.rmDir( config.data_dir+'files/' + [ key, (options.layer || 0) ].join('_'), function(err, res){
      self.rmDir( config.data_dir+'tiles/'+ [ key, (options.layer || 0) ].join('_'), function(err, res){
        self.rmDir( config.data_dir+'thumbs/'+ [ key, (options.layer || 0) ].join('_'), function(err, res){
          if ( callback ) { 
            callback(null, true);
          }
        });
      });
    });
  });
};

exports.rmDir = function(directories, callback){
    if(typeof directories === 'string') {
      directories = [directories];
    }
    var args = directories;
    args.unshift('-rf');
    child.execFile('rm', args, {env:process.env}, function(err, stdout, stderr) {
      callback.apply(this, arguments);
    });
};

exports.get = function(type, key, options, callback ){
  var self = this;
  Cache.db.select( type+':'+key, options, function(err, result){
    self.process( type, key, result, options, callback );     
  });
};

exports.getInfo = function( key, callback ){
  Cache.db.getInfo( key, callback );
};

exports.updateInfo = function( key, info, callback ){
  Cache.db.updateInfo( key, info, callback );
};

exports.getCount = function( key, callback ){
  Cache.db.getCount( key, callback );
};

