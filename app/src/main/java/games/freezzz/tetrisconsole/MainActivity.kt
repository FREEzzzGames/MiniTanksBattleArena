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
import kotlin.math.max
import kotlin.random.Random

class MainActivity : Activity() {
    private lateinit var root: LinearLayout
    private lateinit var gameArea: LinearLayout
    private lateinit var controlArea: LinearLayout
    private lateinit var title: TextView
    private lateinit var stats: TextView
    private lateinit var mission: TextView
    private var selected = "TETRIS"
    private var tetris: TetrisView? = null
    private var arkanoid: ArkanoidView? = null
    private var racing: RacingView? = null
    private var gameScore = 0
    private var gamePaused = false

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        window.statusBarColor = Color.rgb(15,17,18)
        window.navigationBarColor = Color.rgb(15,17,18)
        window.setFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON, WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
        root = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(dp(10), dp(6), dp(10), dp(8))
            setBackgroundColor(Color.rgb(15,17,18))
        }
        title = label("TETRIS CONSOLE", 19f, Color.rgb(239,243,240))
        root.addView(title, LinearLayout.LayoutParams(-1, dp(42)))
        val selector = LinearLayout(this).apply { orientation = LinearLayout.HORIZONTAL; gravity = Gravity.CENTER }
        selector.addView(button("TETRIS",1f) { selectGame("TETRIS") })
        selector.addView(button("ARKANOID",1f) { selectGame("ARKANOID") })
        selector.addView(button("RACING",1f) { selectGame("RACING") })
        root.addView(selector, LinearLayout.LayoutParams(-1, dp(50)))
        stats = label("SCORE 000000", 12f, Color.rgb(114,229,192))
        root.addView(stats, LinearLayout.LayoutParams(-1, dp(32)))
        mission = label("", 10f, Color.rgb(255,190,90))
        root.addView(mission, LinearLayout.LayoutParams(-1, dp(28)))
        gameArea = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL; gravity = Gravity.CENTER }
        root.addView(gameArea, LinearLayout.LayoutParams(-1, 0, 1f))
        controlArea = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL }
        root.addView(controlArea, LinearLayout.LayoutParams(-1, dp(126)))
        setContentView(root)
        selectGame("TETRIS")
    }

    private fun selectGame(game: String) {
        if (selected == game && gameArea.childCount > 0) return
        tetris?.setPaused(true)
        arkanoid?.setPaused(true)
        racing?.setPaused(true)
        selected = game
        gameArea.removeAllViews()
        controlArea.removeAllViews()
        gamePaused = false
        when (game) {
            "TETRIS" -> {
                title.text = "TETRIS CONSOLE"
                mission.visibility = View.VISIBLE
                val score = label("SCORE\\n000000", 11f, Color.rgb(114,229,192))
                val lines = label("LINES\\n00", 11f, Color.rgb(114,229,192))
                val level = label("LEVEL\\n01", 11f, Color.rgb(114,229,192))
                val row = LinearLayout(this).apply { orientation = LinearLayout.HORIZONTAL; gravity = Gravity.CENTER }
                listOf(score,lines,level).forEach { row.addView(it,LinearLayout.LayoutParams(0,dp(38),1f)) }
                // Keep the classic compact stats in the shared status strip.
                gameArea.addView(row, LinearLayout.LayoutParams(-1,dp(38)))
                tetris = TetrisView(this) { s,l,v,task ->
                    stats.text = "SCORE %06d     LINES %02d     LEVEL %02d".format(s,l,v)
                    score.text = "SCORE\\n%06d".format(s); lines.text = "LINES\\n%02d".format(l); level.text = "LEVEL\\n%02d".format(v)
                    mission.text = task
                }
                gameArea.addView(tetris, LinearLayout.LayoutParams(-1,0,1f))
                val actions = controlRow()
                actions.addView(button("◀",1f) { tetris?.move(-1) })
                actions.addView(button("▼",1f) { tetris?.softDrop() })
                actions.addView(button("▶",1f) { tetris?.move(1) })
                actions.addView(button("ROTATE",1.2f) { tetris?.rotate() })
                actions.addView(button("PAUSE",1f) { gamePaused = !gamePaused; tetris?.setPaused(gamePaused) })
                controlArea.addView(actions)
            }
            "ARKANOID" -> {
                title.text = "ARKANOID CONSOLE"
                mission.visibility = View.GONE
                stats.text = "SCORE 000000"
                arkanoid = ArkanoidView(this) { s, lives, message -> stats.text = "SCORE %06d     LIVES %02d".format(s,lives); if(message.isNotEmpty()) stats.text = message }
                gameArea.addView(arkanoid, LinearLayout.LayoutParams(-1,0,1f))
                val controls = controlRow()
                controls.addView(button("◀",1f) { arkanoid?.movePaddle(-1) })
                controls.addView(button("PAUSE",1f) { gamePaused = !gamePaused; arkanoid?.setPaused(gamePaused) })
                controls.addView(button("▶",1f) { arkanoid?.movePaddle(1) })
                controls.addView(button("LAUNCH / RESET",1.3f) { arkanoid?.launchOrReset() })
                controlArea.addView(controls)
                mission.visibility = View.VISIBLE
                mission.text = "BREAK BLOCKS • KEEP THE BALL IN PLAY"
            }
            else -> {
                title.text = "NEON RACING"
                mission.visibility = View.VISIBLE
                mission.text = "STEER • AVOID TRAFFIC • SURVIVE"
                stats.text = "SCORE 000000"
                racing = RacingView(this) { s, message -> stats.text = "SCORE %06d".format(s); if(message.isNotEmpty()) mission.text = message }
                gameArea.addView(racing, LinearLayout.LayoutParams(-1,0,1f))
                val controls = controlRow()
                controls.addView(button("◀",1f) { racing?.steer(-1) })
                controls.addView(button("PAUSE",1f) { gamePaused = !gamePaused; racing?.setPaused(gamePaused) })
                controls.addView(button("▶",1f) { racing?.steer(1) })
                controls.addView(button("RESTART",1.2f) { racing?.restart() })
                controlArea.addView(controls)
            }
        }
    }
    private fun controlRow() = LinearLayout(this).apply { orientation = LinearLayout.HORIZONTAL; gravity = Gravity.CENTER }
    private fun label(textValue: String, size: Float, color: Int) = TextView(this).apply {
        text = textValue; textSize = size; gravity = Gravity.CENTER
        setTextColor(color); typeface = Typeface.create("monospace", Typeface.BOLD); letterSpacing = .03f
    }
    private fun button(textValue: String, weight: Float, action: () -> Unit): Button =
        Button(this).apply {
            text = textValue; textSize = if (textValue.length == 1) 22f else 10f
            isAllCaps = false; setTextColor(Color.rgb(235,240,237))
            setBackgroundColor(Color.rgb(43,48,49)); typeface = Typeface.create("monospace", Typeface.BOLD)
            setOnClickListener { action() }
            layoutParams = LinearLayout.LayoutParams(0, dp(52), weight).apply { setMargins(dp(2), dp(3), dp(2), dp(3)) }
        }
    private fun dp(v: Int) = (v * resources.displayMetrics.density).toInt()
}

private class ArkanoidView(context: Context, val report: (Int, Int, String) -> Unit) : View(context) {
    private val paint = Paint(Paint.ANTI_ALIAS_FLAG)
    private val handler = Handler(Looper.getMainLooper())
    private val cols = 8
    private val rows = 5
    private val bricks = Array(rows) { BooleanArray(cols) { true } }
    private var score = 0
    private var lives = 3
    private var paddleX = .5f
    private var ballX = .5f
    private var ballY = .72f
    private var vx = .0042f
    private var vy = -.0052f
    private var launched = true
    private var paused = false
    private var ended = false
    private var last = System.currentTimeMillis()
    private val tick = object : Runnable {
        override fun run() {
            val now = System.currentTimeMillis()
            val dt = ((now-last).coerceAtMost(40L)).toFloat(); last=now
            if (!paused && !ended && launched) update(dt)
            invalidate(); handler.postDelayed(this,16)
        }
    }
    init { handler.post(tick) }
    fun setPaused(v:Boolean) { paused=v; last=System.currentTimeMillis(); invalidate() }
    fun movePaddle(dir:Int) { paddleX=(paddleX+dir*.07f).coerceIn(.12f,.88f); if(!launched) ballX=paddleX; invalidate() }
    fun launchOrReset() {
        if (ended) { for(r in 0 until rows) for(c in 0 until cols) bricks[r][c]=true; score=0; lives=3; ended=false }
        launched=true; ballX=paddleX; ballY=.72f; vx=if(Random.nextBoolean()) .0042f else -.0042f; vy=-.0052f; report(score,lives,"")
    }
    private fun update(dt:Float) {
        ballX+=vx*dt; ballY+=vy*dt
        if(ballX<.035f || ballX>.965f) vx=-vx
        if(ballY<.035f) vy=kotlin.math.abs(vy)
        val paddleY=.88f
        if(vy>0 && ballY>=paddleY-.025f && ballY<=paddleY+.02f && kotlin.math.abs(ballX-paddleX)<.14f) {
            vy=-kotlin.math.abs(vy); vx=((ballX-paddleX)*.045f).coerceIn(-.008f,.008f)
        }
        val col=(ballX*cols).toInt().coerceIn(0,cols-1)
        val row=(ballY*rows/.48f).toInt()
        if(row in 0 until rows && bricks[row][col] && ballY<.5f) {
            bricks[row][col]=false; score+=10; vy=-vy
            if(bricks.all { line -> line.none { it } }) { for(r in 0 until rows) for(c in 0 until cols) bricks[r][c]=true; score+=100; vy*=1.08f }
            report(score,lives,"")
        }
        if(ballY>1.04f) {
            lives--
            if(lives<=0) { ended=true; report(score,lives,"GAME OVER • RESET TO PLAY") }
            else { launched=true; ballX=paddleX; ballY=.72f; vy=-.0052f; vx=if(Random.nextBoolean()) .0042f else -.0042f; report(score,lives,"") }
        }
    }
    override fun onDraw(canvas:Canvas) {
        super.onDraw(canvas); canvas.drawColor(Color.rgb(9,13,12))
        val w=width.toFloat(); val h=height.toFloat()
        paint.style=Paint.Style.STROKE; paint.strokeWidth=2f; paint.color=Color.rgb(47,66,59)
        canvas.drawRoundRect(RectF(w*.04f,h*.02f,w*.96f,h*.98f),12f,12f,paint)
        val gap=w*.012f; val bw=(w*.90f-gap*(cols-1))/cols; val bh=h*.034f
        for(r in 0 until rows) for(c in 0 until cols) if(bricks[r][c]) {
            paint.style=Paint.Style.FILL; paint.color=when(r){0->Color.rgb(255,183,3);1->Color.rgb(255,120,70);2->Color.rgb(217,4,41);3->Color.rgb(102,252,241);else->Color.rgb(114,229,192)}
            val x=w*.05f+c*(bw+gap); val y=h*.08f+r*(bh+gap)
            canvas.drawRoundRect(RectF(x,y,x+bw,y+bh),4f,4f,paint)
        }
        paint.color=Color.rgb(114,229,192)
        canvas.drawRoundRect(RectF((paddleX-.12f)*w,h*.88f,(paddleX+.12f)*w,h*.91f),6f,6f,paint)
        canvas.drawCircle(ballX*w,ballY*h,min(w,h)*.012f,paint)
        if(paused || ended) {
            paint.color=Color.argb(220,9,13,12); canvas.drawRect(w*.05f,h*.4f,w*.95f,h*.6f,paint)
            paint.color=Color.rgb(239,243,240); paint.textAlign=Paint.Align.CENTER; paint.typeface=Typeface.create("monospace",Typeface.BOLD); paint.textSize=min(w,h)*.06f
            canvas.drawText(if(ended) "GAME OVER" else "PAUSED",w/2,h*.51f,paint)
        }
    }
}

private class RacingView(context: Context, val report: (Int, String) -> Unit) : View(context) {
    private data class Car(var lane:Int,var y:Float,var color:Int)
    private val paint=Paint(Paint.ANTI_ALIAS_FLAG)
    private val handler=Handler(Looper.getMainLooper())
    private val traffic=ArrayList<Car>()
    private var lane=1
    private var score=0
    private var speed=5f
    private var paused=false
    private var crashed=false
    private var spawnCounter=0
    private var last=System.currentTimeMillis()
    private val tick=object:Runnable {
        override fun run() {
            val now=System.currentTimeMillis(); val dt=((now-last).coerceAtMost(40L)).toFloat()/16f; last=now
            if(!paused && !crashed) update(dt)
            invalidate(); handler.postDelayed(this,16)
        }
    }
    init { handler.post(tick) }
    fun setPaused(v:Boolean) { paused=v; last=System.currentTimeMillis(); invalidate() }
    fun steer(dir:Int) { if(!paused && !crashed) lane=(lane+dir).coerceIn(0,2); invalidate() }
    fun restart() { lane=1; score=0; speed=5f; traffic.clear(); paused=false; crashed=false; spawnCounter=0; last=System.currentTimeMillis(); report(score,"STEER • AVOID TRAFFIC • SURVIVE"); invalidate() }
    private fun update(dt:Float) {
        score+=(dt*speed*.25f).toInt().coerceAtLeast(1)
        spawnCounter+=dt.toInt().coerceAtLeast(1)
        if(spawnCounter>max(12,32-(score/250))) {
            spawnCounter=0
            val newLane=Random.nextInt(0,3)
            traffic.add(Car(newLane,-.18f,if(Random.nextBoolean()) Color.rgb(255,183,3) else Color.rgb(217,4,41)))
        }
        speed=(5f+score/500f).coerceAtMost(12f)
        val it=traffic.iterator()
        while(it.hasNext()) {
            val car=it.next(); car.y+=.008f*dt*speed
            if(car.y>.72f && car.y<.91f && car.lane==lane) { crashed=true; report(score,"CRASH • RESTART TO DRIVE"); return }
            if(car.y>1.15f) it.remove()
        }
        if(score%30==0) report(score,"STEER • AVOID TRAFFIC • SURVIVE")
    }
    override fun onDraw(canvas:Canvas) {
        super.onDraw(canvas); canvas.drawColor(Color.rgb(9,13,12))
        val w=width.toFloat(); val h=height.toFloat()
        paint.style=Paint.Style.FILL; paint.color=Color.rgb(20,26,25); canvas.drawRect(w*.08f,0f,w*.92f,h,paint)
        paint.color=Color.rgb(75,89,83); canvas.drawRect(w*.08f,0f,w*.095f,h,paint); canvas.drawRect(w*.905f,0f,w*.92f,h,paint)
        paint.color=Color.rgb(48,58,54)
        for(y in -1..12) {
            val yy=((y* h*.12f + (score*2f % (h*.12f))) % (h*1.2f))
            canvas.drawRect(w*.395f,yy,w*.405f,yy+h*.055f,paint); canvas.drawRect(w*.595f,yy,w*.605f,yy+h*.055f,paint)
        }
        for(car in traffic) drawCar(canvas, w*(.25f+car.lane*.25f),car.y*h,w*.13f,h*.11f,car.color)
        drawCar(canvas,w*(.25f+lane*.25f),h*.78f,w*.14f,h*.12f,Color.rgb(102,252,241))
        if(paused || crashed) {
            paint.color=Color.argb(220,9,13,12); canvas.drawRect(w*.08f,h*.4f,w*.92f,h*.6f,paint)
            paint.color=Color.rgb(239,243,240); paint.textAlign=Paint.Align.CENTER; paint.typeface=Typeface.create("monospace",Typeface.BOLD); paint.textSize=min(w,h)*.055f
            canvas.drawText(if(crashed) "CRASH" else "PAUSED",w/2,h*.51f,paint)
        }
    }
    private fun drawCar(canvas:Canvas,cx:Float,cy:Float,cw:Float,ch:Float,color:Int) {
        paint.color=color; canvas.drawRoundRect(RectF(cx-cw/2,cy-ch/2,cx+cw/2,cy+ch/2),8f,8f,paint)
        paint.color=Color.rgb(15,17,18); canvas.drawRoundRect(RectF(cx-cw*.28f,cy-ch*.25f,cx+cw*.28f,cy+ch*.12f),5f,5f,paint)
        paint.color=Color.rgb(239,243,240); canvas.drawRect(cx-cw*.38f,cy-ch*.42f,cx-cw*.18f,cy-ch*.32f,paint); canvas.drawRect(cx+cw*.18f,cy-ch*.42f,cx+cw*.38f,cy-ch*.32f,paint)
    }
}

private class TetrisView(context: Context, val report: (Int, Int, Int, String) -> Unit) : View(context) {
    private data class Task(val id: String, val title: String, val event: String, val target: Int, val reward: Int)
    private val tasks = listOf(
        Task("move10", "Move 10 times", "move", 10, 60),
        Task("move20", "Move 20 times", "move", 20, 100),
        Task("drop5", "Soft-drop 5 times", "drop", 5, 60),
        Task("drop15", "Soft-drop 15 times", "drop", 15, 110),
        Task("rotate3", "Rotate 3 times", "rotate", 3, 60),
        Task("rotate8", "Rotate 8 times", "rotate", 8, 100),
        Task("lock5", "Lock 5 pieces", "lock", 5, 70),
        Task("lock12", "Lock 12 pieces", "lock", 12, 130),
        Task("lines3", "Clear 3 lines total", "lines", 3, 80),
        Task("lines8", "Clear 8 lines total", "lines", 8, 140),
        Task("single", "Clear a single line", "clear1", 1, 70),
        Task("double", "Clear 2 lines at once", "clear2", 1, 100),
        Task("triple", "Clear 3 lines at once", "clear3", 1, 140),
        Task("tetris", "Clear 4 lines at once", "clear4", 1, 200),
        Task("level3", "Reach level 3", "level", 3, 100),
        Task("level5", "Reach level 5", "level", 5, 180)
    )
    private var activeTask = tasks.random()
    private var previousTaskId = activeTask.id
    private var taskProgress = 0
    private fun taskText() = "TASK: ${activeTask.title}  [${taskProgress}/${activeTask.target}]  +${activeTask.reward}"
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
    init { handler.post(tick); report(score, lines, level, taskText()) }
    fun setPaused(value: Boolean) { paused = value; lastTick = System.currentTimeMillis(); invalidate() }
    fun restart() { board.forEach { it.fill(0) }; score=0; lines=0; level=1; gameOver=false; paused=false; taskProgress=0; previousTaskId=""; chooseNextTask(); spawn(); report(score,lines,level,taskText()); invalidate() }
    fun move(dx: Int) { if (!paused && !gameOver && valid(piece, px+dx, py)) { px+=dx; onTaskEvent("move"); invalidate() } }
    fun softDrop() { if (!paused && !gameOver) { onTaskEvent("drop"); if (valid(piece,px,py+1)) { py++; score++ } else lockPiece(); report(score,lines,level,taskText()); invalidate() } }
    fun rotate() {
        if (paused || gameOver) return
        onTaskEvent("rotate")
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
        onTaskEvent("lock")
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
        if (cleared>0) {
            lines+=cleared
            score+=when(cleared) { 1->100; 2->300; 3->500; else->800 }*level
            val oldLevel = level
            level=lines/10+1
            if (level > oldLevel) onTaskEvent("level", level)
            else if (activeTask.event == "lines") onTaskEvent("lines", cleared)
            else onTaskEvent("clear$cleared")
        }
        spawn(); report(score,lines,level,taskText())
    }
    private fun chooseNextTask() {
        val options = tasks.filter { it.id != previousTaskId }
        activeTask = options.random()
        previousTaskId = activeTask.id
        taskProgress = 0
    }
    private fun onTaskEvent(event: String, amount: Int = 1) {
        if (activeTask.event != event || gameOver || paused) return
        taskProgress = (taskProgress + amount).coerceAtMost(activeTask.target)
        if (taskProgress >= activeTask.target) {
            score += activeTask.reward
            chooseNextTask()
        }
        report(score, lines, level, taskText())
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
