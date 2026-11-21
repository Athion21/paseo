package sh.paseo.phoneexport

import android.app.Activity
import android.content.Intent
import expo.modules.kotlin.Promise
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.io.IOException

class PaseoPhoneExportModule : Module() {
  private var pending: Promise? = null
  private var contents: ByteArray? = null

  override fun definition() = ModuleDefinition {
    Name("PaseoPhoneExport")

    AsyncFunction("saveTextDocument") { suggestedName: String, mimeType: String, text: String, promise: Promise ->
      if (pending != null) {
        promise.resolve(mapOf("status" to "failed", "reason" to "busy"))
        return@AsyncFunction
      }
      val activity = appContext.currentActivity
      if (activity == null) {
        promise.resolve(mapOf("status" to "failed", "reason" to "unavailable"))
        return@AsyncFunction
      }
      val intent = Intent(Intent.ACTION_CREATE_DOCUMENT).apply {
        addCategory(Intent.CATEGORY_OPENABLE)
        type = mimeType
        putExtra(Intent.EXTRA_TITLE, suggestedName)
      }
      pending = promise
      contents = text.toByteArray(Charsets.UTF_8)
      try {
        activity.startActivityForResult(intent, CREATE_DOCUMENT_REQUEST)
      } catch (_: RuntimeException) {
        pending = null
        contents = null
        promise.resolve(mapOf("status" to "failed", "reason" to "unavailable"))
      }
    }

    OnActivityResult { _, payload ->
      if (payload.requestCode != CREATE_DOCUMENT_REQUEST) return@OnActivityResult
      val promise = pending
      val bytes = contents
      pending = null
      contents = null
      if (promise == null || bytes == null) return@OnActivityResult
      val uri = payload.data?.data
      if (payload.resultCode != Activity.RESULT_OK || uri == null) {
        promise.resolve(mapOf("status" to "cancelled"))
        return@OnActivityResult
      }
      try {
        val resolver = appContext.reactContext?.contentResolver
        val stream = resolver?.openOutputStream(uri, "wt")
        if (stream == null) throw IOException("unopened")
        stream.use { it.write(bytes) }
        promise.resolve(mapOf("status" to "saved"))
      } catch (_: Exception) {
        promise.resolve(mapOf("status" to "failed", "reason" to "failed"))
      }
    }

    OnDestroy {
      pending?.resolve(mapOf("status" to "cancelled"))
      pending = null
      contents = null
    }
  }

  private companion object {
    const val CREATE_DOCUMENT_REQUEST = 73621
  }
}
