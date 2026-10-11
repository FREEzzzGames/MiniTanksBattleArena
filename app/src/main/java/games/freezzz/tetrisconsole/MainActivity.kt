package games.freezzz.tetrisconsole

import android.app.Activity
import android.os.Bundle
import android.graphics.Canvas
import android.graphics.Paint
import android.graphics.Color
import android.graphics.RectF
import android.view.Gravity
import android.view.View
import android.view.WindowManager
import android.widget.Button
import android.widget.LinearLayout
import android.widget.TextView
import android.graphics.Typeface
import android.content.Context
import android.os.Handler
import android.os.Looper
import kotlin.math.min

class MainActivity : Activity() {
    private lateinit var board: TetrisView
    private lateinit var pauseButton: Button
    private var paused = false

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        window.statusBarColor = Color.rgb(15,17,18)
        window.navigationBarColor = Color.rgb(15,17,18)
        window.setFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON, WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
        val root = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(dp(14), dp(8), dp(14), dp(10))
            setBackgroundColor(Color.rgb(15,17,18))
        }
        root.addView(label("TETRIS CONSOLE", 20f, Color.rgb(239,243,240)), LinearLayout.LayoutParams(-1, dp(48)))
        val stats = LinearLayout(this).apply { gravity = Gravity.CENTER; orientation = LinearLayout.HORIZONTAL }
        val score = label("SCORE\n000000", 12f, Color.rgb(114,229,192))
        val lines = label("LINES\n00", 12f, Color.rgb(114,229,192))
        val level = label("LEVEL\n01", 12f, Color.rgb(114,229,192))
        listOf(score, lines, level).forEach { stats.addView(it, LinearLayout.LayoutParams(0, dp(46), 1f)) }
        root.addView(stats)
        board = TetrisView(this) { s, l, v -> score.text = "SCORE\n%06d".format(s); lines.text = "LINES\n%02d".format(l); level.text = "LEVEL\n%02d".format(v) }
        root.addView(board, LinearLayout.LayoutParams(-1, 0, 1f))
        val actions = LinearLayout(this).apply { gravity = Gravity.CENTER; orientation = LinearLayout.HORIZONTAL }
        actions.addView(button("ROTATE", 1.3f) { board.rotate() })
        pauseButton = button("PAUSE", 1f) {
            if (board.gameOver) { board.restart(); paused = false; pauseButton.text = "PAUSE" }
            else { paused = !paused; board.setPaused(paused); pauseButton.text = if (paused) "RESUME" else "PAUSE" }
        }
        actions.addView(pauseButton, LinearLayout.LayoutParams(0, dp(50), 1f).apply { setMargins(dp(4), dp(4), dp(4), dp(4)) })
        root.addView(actions, LinearLayout.LayoutParams(-1, dp(58)))
        val controls = LinearLayout(this).apply { gravity = Gravity.CENTER; orientation = LinearLayout.HORIZONTAL }
        controls.addView(button("◀", 1f) { board.move(-1) })
        controls.addView(button("▼", 1f) { board.softDrop() })
        controls.addView(button("▶", 1f) { board.move(1) })
        root.addView(controls, LinearLayout.LayoutParams(-1, dp(66)))
        root.addView(label("LEFT / RIGHT     SOFT DROP     ROTATE", 10f, Color.rgb(103,117,110)), LinearLayout.LayoutParams(-1, dp(22)))
        setContentView(root)
    }

    private fun label(textValue: String, size: Float, color: Int) = TextView(this).apply {
        text = textValue; textSize = size; gravity = Gravity.CENTER
        setTextColor(color); typeface = Typeface.create("monospace", Typeface.BOLD)
        letterSpacing = .06f
    }
    private fun button(textValue: String, weight: Float, action: () -> Unit): Button =
        Button(this).apply {
            text = textValue; textSize = if (textValue.length == 1) 22f else 12f
            isAllCaps = false; setTextColor(Color.rgb(235,240,237))
            setBackgroundColor(Color.rgb(43,48,49)); typeface = Typeface.create("monospace", Typeface.BOLD)
            setOnClickListener { action() }
            layoutParams = LinearLayout.LayoutParams(0, dp(50), weight).apply { setMargins(dp(4), dp(4), dp(4), dp(4)) }
        }
    private fun dp(v: Int) = (v * resources.displayMetrics.density).toInt()
}

private class TetrisView(context: Context, val report: (Int, Int, Int) -> Unit) : View(context) {
    private val cols = 10; private val rows = 20
    private val board = Array(rows) { IntArray(cols) }
    private val shapes = arrayOf(
        arrayOf(intArrayOf(1,1,1,1)),
        arrayOf(intArrayOf(1,1), intArrayOf(1,1)),
        arrayOf(intArrayOf(0,1,0), intArrayOf(1,1,1)),
        arrayOf(intArrayOf(1,0,0), intArrayOf(1,1,1)),
        arrayOf(intArrayOf(0,0,1), intArrayOf(1,1,1)),
        arrayOf(intArrayOf(0,1,1), intArrayOf(1,1,0)),
        arrayOf(intArrayOf(1,1,0), intArrayOf(0,1,1))
    )
    private val paint = Paint(Paint.ANTI_ALIAS_FLAG)
    private val handler = Handler(Looper.getMainLooper())
    private var piece = copyShape(shapes.random())
    private var px = 3; private var py = 0
    private var score = 0; private var lines = 0; private var level = 1
    private var paused = false; var gameOver = false; private var lastTick = System.currentTimeMillis()
    private val tick = object : Runnable {
        override fun run() {
            val now = System.currentTimeMillis()
            if (!paused && !gameOver && now - lastTick >= maxOf(100L, 650L - (level - 1) * 45L)) {
                stepDown(); lastTick = now
            }
            invalidate(); handler.postDelayed(this, 32)
        }
    }
    init { handler.post(tick) }
    fun setPaused(value: Boolean) { paused = value; lastTick = System.currentTimeMillis(); invalidate() }
    fun restart() { board.forEach { it.fill(0) }; score=0; lines=0; level=1; gameOver=false; paused=false; spawn(); report(score,lines,level); invalidate() }
    fun move(dx: Int) { if (!paused && !gameOver && valid(piece, px+dx, py)) { px+=dx; invalidate() } }
    fun softDrop() { if (!paused && !gameOver) { if (valid(piece,px,py+1)) { py++; score++ } else lockPiece(); report(score,lines,level); invalidate() } }
    fun rotate() {
        if (paused || gameOver) return
        val h = piece.size; val w = piece.maxOf { it.size }
        val rotated = Array(w) { IntArray(h) }
        for (r in piece.indices) for (c in piece[r].indices) if (piece[r][c] != 0) rotated[c][h-1-r] = 1
        for (kick in intArrayOf(0,-1,1,-2,2)) if (valid(rotated,px+kick,py)) { piece=rotated; px+=kick; invalidate(); return }
    }
    private fun stepDown() { if (valid(piece,px,py+1)) py++ else lockPiece() }
    private fun valid(s: Array<IntArray>, x: Int, y: Int): Boolean {
        for (r in s.indices) for (c in s[r].indices) if (s[r][c] != 0) {
            val bx=x+c; val by=y+r
            if (bx<0 || bx>=cols || by>=rows) return false
            if (by>=0 && board[by][bx]!=0) return false
        }
        return true
    }
    private fun lockPiece() {
        for (r in piece.indices) for (c in piece[r].indices) if (piece[r][c]!=0) {
            val bx=px+c; val by=py+r
            if (by<0) { gameOver=true; return }
            if (by in 0 until rows && bx in 0 until cols) board[by][bx]=1
        }
        var cleared=0; var r=rows-1
        while (r>=0) {
            if (board[r].all { it!=0 }) {
                for (y in r downTo 1) board[y]=board[y-1].copyOf()
                board[0]=IntArray(cols); cleared++
            } else r--
        }
        if (cleared>0) { lines+=cleared; score+=when(cleared) { 1->100; 2->300; 3->500; else->800 }*level; level=lines/10+1 }
        spawn(); report(score,lines,level)
    }
    private fun spawn() {
        piece=copyShape(shapes.random()); px=(cols-piece.maxOf { it.size })/2; py=0
        if (!valid(piece,px,py)) gameOver=true
    }
    private fun copyShape(s: Array<IntArray>) = s.map { it.copyOf() }.toTypedArray()
    override fun onDraw(canvas: Canvas) {
        super.onDraw(canvas); canvas.drawColor(Color.rgb(9,13,12))
        val cell=min(width.toFloat()/cols,height.toFloat()/rows)
        val bw=cell*cols; val bh=cell*rows; val left=(width-bw)/2f; val top=(height-bh)/2f
        paint.style=Paint.Style.FILL; paint.color=Color.rgb(13,19,17)
        canvas.drawRoundRect(RectF(left-5,top-5,left+bw+5,top+bh+5),8f,8f,paint)
        for (r in 0 until rows) for (c in 0 until cols) {
            val x=left+c*cell; val y=top+r*cell
            paint.color=if (board[r][c]!=0) Color.rgb(114,229,192) else Color.rgb(24,32,29)
            canvas.drawRect(x+1,y+1,x+cell-1,y+cell-1,paint)
            if (board[r][c]!=0) { paint.color=Color.rgb(174,255,224); canvas.drawRect(x+2,y+2,x+cell-2,y+3,paint) }
        }
        if (!gameOver) for (r in piece.indices) for (c in piece[r].indices) if (piece[r][c]!=0) {
            val x=left+(px+c)*cell; val y=top+(py+r)*cell
            paint.color=Color.rgb(114,229,192); canvas.drawRect(x+1,y+1,x+cell-1,y+cell-1,paint)
        }
        if (paused || gameOver) {
            paint.color=Color.argb(220,9,13,12); canvas.drawRect(left,top,left+bw,top+bh,paint)
            paint.color=Color.rgb(239,243,240); paint.textAlign=Paint.Align.CENTER
            paint.typeface=Typeface.create("monospace",Typeface.BOLD); paint.textSize=cell*.72f
            canvas.drawText(if (gameOver) "GAME OVER" else "PAUSED",width/2f,height/2f,paint)
        }
    }
}
