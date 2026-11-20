package com.anxhul10.calidraw.ai

import android.content.Context
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import java.io.BufferedReader
import java.io.InputStreamReader
import java.net.HttpURLConnection
import java.net.URL

class AIProvider(context: Context) {

    private val securePreferences = SecurePreferences(context)

    companion object {
        private const val CHATGPT_ENDPOINT = "https://api.openai.com/v1/chat/completions"
        private const val GEMINI_ENDPOINT = "https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent"
    }

    /**
     * Sends a prompt to the ChatGPT API and returns the raw JSON response.
     * Requires a stored ChatGPT API key under the key "chatgpt_key".
     */
    suspend fun askChatGPT(prompt: String): String = withContext(Dispatchers.IO) {
        val apiKey = securePreferences.getString("chatgpt_key", null)
            ?: return@withContext "ChatGPT API key not set"
        val url = URL(CHATGPT_ENDPOINT)
        val conn = url.openConnection() as HttpURLConnection
        conn.requestMethod = "POST"
        conn.setRequestProperty("Authorization", "Bearer $apiKey")
        conn.setRequestProperty("Content-Type", "application/json")
        conn.doOutput = true

        val jsonBody = """
        {
            \"model\": \"gpt-3.5-turbo\",
            \"messages\": [{\"role\": \"user\", \"content\": \"$prompt\"}],
            \"max_tokens\": 150
        }
        """.trimIndent()

        conn.outputStream.use { os ->
            os.write(jsonBody.toByteArray())
        }

        val responseCode = conn.responseCode
        val reader = if (responseCode in 200..299) {
            BufferedReader(InputStreamReader(conn.inputStream))
        } else {
            BufferedReader(InputStreamReader(conn.errorStream))
        }
        val response = StringBuilder()
        var line: String?
        while (reader.readLine().also { line = it } != null) {
            response.append(line)
        }
        reader.close()
        response.toString()
    }

    /**
     * Sends a prompt to the Gemini API and returns the raw JSON response.
     * Requires a stored Gemini API key under the key "gemini_key".
     */
    suspend fun askGemini(prompt: String): String = withContext(Dispatchers.IO) {
        val apiKey = securePreferences.getString("gemini_key", null)
            ?: return@withContext "Gemini API key not set"
        val url = URL("$GEMINI_ENDPOINT?key=$apiKey")
        val conn = url.openConnection() as HttpURLConnection
        conn.requestMethod = "POST"
        conn.setRequestProperty("Content-Type", "application/json")
        conn.doOutput = true

        val jsonBody = """
        {
            \"contents\": [{\"role\": \"user\", \"parts\": [{\"text\": \"$prompt\"}]}]
        }
        """.trimIndent()

        conn.outputStream.use { os ->
            os.write(jsonBody.toByteArray())
        }

        val responseCode = conn.responseCode
        val reader = if (responseCode in 200..299) {
            BufferedReader(InputStreamReader(conn.inputStream))
        } else {
            BufferedReader(InputStreamReader(conn.errorStream))
        }
        val response = StringBuilder()
        var line: String?
        while (reader.readLine().also { line = it } != null) {
            response.append(line)
        }
        reader.close()
        response.toString()
    }
}
