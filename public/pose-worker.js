/* Classic worker: MediaPipe's WASM loader uses importScripts. No video is uploaded. */
let detector;
self.onmessage = async ({data}) => {
  if(data.type==='init'){
    try {
      self.exports={};
      // The CDN serves .cjs as application/node; importScripts requires JavaScript MIME.
      const response=await fetch('https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.21/vision_bundle.cjs');
      if(!response.ok)throw new Error('Pose runtime unavailable: '+response.status);
      const script=URL.createObjectURL(new Blob([await response.text()],{type:'application/javascript'}));
      try{importScripts(script);}finally{URL.revokeObjectURL(script);}
      const {FilesetResolver,PoseLandmarker}=self.exports;
      const vision=await FilesetResolver.forVisionTasks('https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.21/wasm');
      detector=await PoseLandmarker.createFromOptions(vision,{
        baseOptions:{modelAssetPath:'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task',delegate:'CPU'},
        runningMode:'VIDEO',numPoses:1,minPoseDetectionConfidence:.55,minTrackingConfidence:.55,
      });
      self.postMessage({type:'ready'});
    }catch(error){self.postMessage({type:'error',message:String(error)});}
  }else if(data.type==='frame'){
    try {
      const result=detector.detectForVideo(data.bitmap,data.at);
      self.postMessage({type:'pose',points:result.landmarks[0]||[],at:data.at});
    }catch(error){self.postMessage({type:'frameError',message:String(error)});}
    finally{data.bitmap.close();}
  }
};
