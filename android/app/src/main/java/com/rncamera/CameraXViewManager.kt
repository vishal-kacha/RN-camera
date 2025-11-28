package com.rncamera

import android.util.Log
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.uimanager.SimpleViewManager
import com.facebook.react.uimanager.ThemedReactContext

class CameraXViewManager(private val reactContext: ReactApplicationContext) :
        SimpleViewManager<CameraXView>() {

    companion object {
        var lastCreatedView: CameraXView? = null
    }

    override fun getName(): String = "CameraXView"

    override fun createViewInstance(reactContext: ThemedReactContext): CameraXView {
        Log.d("CameraXViewManager", "Creating camera view")
        val view = CameraXView(reactContext)
        lastCreatedView = view
        Log.d("CameraXViewManager", "Camera view created and stored")
        return view
    }

    override fun onDropViewInstance(view: CameraXView) {
        super.onDropViewInstance(view)
        Log.d("CameraXViewManager", "Dropping camera view")
        if (lastCreatedView == view) {
            lastCreatedView = null
        }
        view.cleanup()
    }
}
