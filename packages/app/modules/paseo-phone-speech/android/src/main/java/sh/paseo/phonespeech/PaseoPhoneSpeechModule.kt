package sh.paseo.phonespeech

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.os.Bundle
import android.speech.tts.TextToSpeech
import android.speech.tts.UtteranceProgressListener
import android.speech.tts.Voice
import androidx.core.content.ContextCompat
import expo.modules.kotlin.Promise
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.util.Locale

class PaseoPhoneSpeechModule : Module() {
  private var engine: TextToSpeech? = null
  private var status: String = "pending"
  private val waiters = mutableListOf<Promise>()
  private var currentToken: String? = null
  private var lastPieceIndex = -1
  private var screenReceiver: BroadcastReceiver? = null

  override fun definition() = ModuleDefinition {
    Name("PaseoPhoneSpeech")
    Events("status")

    OnCreate {
      val context = appContext.reactContext ?: run {
        finishInit("unavailable")
        return@OnCreate
      }
      registerScreenOff(context)
      engine = TextToSpeech(context) { result ->
        if (result != TextToSpeech.SUCCESS) {
          finishInit("missing-offline-zh")
          return@TextToSpeech
        }
        val created = engine
        if (created == null) {
          finishInit("unavailable")
          return@TextToSpeech
        }
        created.setOnUtteranceProgressListener(progressListener)
        finishInit(configureOfflineChinese(created))
      }
    }

    AsyncFunction("prepare") { promise: Promise ->
      if (status == "pending") {
        waiters.add(promise)
      } else {
        promise.resolve(status)
      }
    }

    Function("speak") { chunks: List<String>, token: String ->
      val created = engine
      if (status != "ready" || created == null) {
        sendEvent(
          "status",
          mapOf("type" to "error", "token" to token, "code" to if (status == "pending") "unavailable" else status),
        )
        return@Function
      }
      currentToken = token
      val limit = TextToSpeech.getMaxSpeechInputLength().coerceAtLeast(1)
      val pieces = chunks.flatMap { piece -> splitForEngine(piece, limit) }
      if (pieces.isEmpty()) {
        currentToken = null
        lastPieceIndex = -1
        sendEvent("status", mapOf("type" to "done", "token" to token))
        return@Function
      }
      lastPieceIndex = pieces.lastIndex
      pieces.forEachIndexed { index, piece ->
        val utteranceId = "$token#$index"
        val mode = if (index == 0) TextToSpeech.QUEUE_FLUSH else TextToSpeech.QUEUE_ADD
        val params = Bundle()
        params.putString(TextToSpeech.Engine.KEY_PARAM_UTTERANCE_ID, utteranceId)
        created.speak(piece, mode, params, utteranceId)
      }
    }

    Function("stop") {
      stopSpeaking()
    }

    OnActivityEntersBackground {
      stopSpeaking()
      sendEvent("status", mapOf("type" to "stopped"))
    }

    OnDestroy {
      stopSpeaking()
      unregisterScreenOff()
      waiters.forEach { promise -> promise.resolve("unavailable") }
      waiters.clear()
      engine?.shutdown()
      engine = null
    }
  }

  private val progressListener = object : UtteranceProgressListener() {
    override fun onStart(utteranceId: String?) = Unit

    override fun onDone(utteranceId: String?) {
      val token = tokenFrom(utteranceId) ?: return
      if (token != currentToken) return
      if (!isLastPiece(utteranceId)) return
      currentToken = null
      sendEvent("status", mapOf("type" to "done", "token" to token))
    }

    @Deprecated("Deprecated in Java")
    override fun onError(utteranceId: String?) {
      reportError(utteranceId)
    }

    override fun onError(utteranceId: String?, errorCode: Int) {
      reportError(utteranceId)
    }
  }

  private fun reportError(utteranceId: String?) {
    val token = tokenFrom(utteranceId) ?: return
    if (token != currentToken) return
    currentToken = null
    sendEvent("status", mapOf("type" to "error", "token" to token, "code" to "error"))
  }

  private fun finishInit(next: String) {
    status = next
    val pending = waiters.toList()
    waiters.clear()
    pending.forEach { promise -> promise.resolve(next) }
  }

  private fun stopSpeaking() {
    currentToken = null
    lastPieceIndex = -1
    engine?.stop()
  }

  private fun registerScreenOff(context: Context) {
    if (screenReceiver != null) return
    val receiver = object : BroadcastReceiver() {
      override fun onReceive(ctx: Context?, intent: Intent?) {
        if (intent?.action != Intent.ACTION_SCREEN_OFF) return
        stopSpeaking()
        sendEvent("status", mapOf("type" to "stopped"))
      }
    }
    screenReceiver = receiver
    ContextCompat.registerReceiver(
      context,
      receiver,
      IntentFilter(Intent.ACTION_SCREEN_OFF),
      ContextCompat.RECEIVER_NOT_EXPORTED,
    )
  }

  private fun unregisterScreenOff() {
    val receiver = screenReceiver ?: return
    screenReceiver = null
    appContext.reactContext?.unregisterReceiver(receiver)
  }

  private fun tokenFrom(utteranceId: String?): String? {
    if (utteranceId == null) return null
    val split = utteranceId.lastIndexOf('#')
    if (split <= 0) return null
    return utteranceId.substring(0, split)
  }

  private fun isLastPiece(utteranceId: String?): Boolean {
    val token = currentToken ?: return false
    return utteranceId == "$token#$lastPieceIndex"
  }
}

internal fun configureOfflineChinese(tts: TextToSpeech): String {
  val offline = tts.voices.orEmpty().filter { voice -> isOfflineChinese(voice) }
  val chosen = offline.maxWithOrNull(
    compareBy<Voice>(
      { if (it.locale.country.equals("CN", true)) 1 else 0 },
      { it.quality },
    ),
  )
  if (chosen != null && tts.setVoice(chosen) != TextToSpeech.ERROR && isOfflineChinese(tts.voice)) {
    return "ready"
  }
  val available = tts.setLanguage(Locale.SIMPLIFIED_CHINESE)
  if (available < TextToSpeech.LANG_AVAILABLE) return "missing-offline-zh"
  return if (isOfflineChinese(tts.voice)) "ready" else "missing-offline-zh"
}

internal fun isOfflineChinese(voice: Voice?): Boolean {
  if (voice == null) return false
  if (voice.isNetworkConnectionRequired) return false
  if (voice.features.contains(TextToSpeech.Engine.KEY_FEATURE_NOT_INSTALLED)) return false
  return voice.locale.language.equals("zh", true) &&
    (voice.locale.country.isEmpty() || voice.locale.country.equals("CN", true))
}

internal fun splitForEngine(text: String, limit: Int): List<String> {
  if (text.isEmpty()) return emptyList()
  if (text.length <= limit) return listOf(text)
  val parts = mutableListOf<String>()
  var start = 0
  while (start < text.length) {
    var end = minOf(start + limit, text.length)
    if (end < text.length) {
      val window = text.substring(start, end)
      val breakAt = lastSpeechBreak(window)
      if (breakAt > limit / 2) end = start + breakAt
    }
    val part = text.substring(start, end).trim()
    if (part.isNotEmpty()) parts.add(part)
    if (end <= start) end = start + 1
    start = end
  }
  return parts
}

private fun lastSpeechBreak(window: String): Int {
  val marks = charArrayOf('\n', '。', '！', '？', '；', '.', '!', '?', ';', '，', ',', ' ')
  var best = -1
  for (mark in marks) {
    val index = window.lastIndexOf(mark)
    if (index > best) best = index + 1
  }
  return best
}
