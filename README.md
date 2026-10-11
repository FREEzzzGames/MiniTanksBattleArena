# Tetris Console

Самостоятельная Android-игра Tetris Console. Не связана с FREEzzzGames Portal или другими играми.

## Управление
- ◀ / ▶ — движение влево и вправо
- ▼ — мягкое ускорение падения
- ROTATE — поворот фигуры
- PAUSE / RESUME — пауза и продолжение
- После проигрыша кнопка RESUME начинает новую игру

Кнопки DROP (мгновенный сброс) нет.

## Сборка APK
Каждый push в `main` запускает GitHub Actions. Открой вкладку **Actions**, выбери **Build Tetris Console APK**, затем скачай артефакт **TetrisConsole-debug-apk** из завершённого запуска. Внутри будет `app-debug.apk`.

APK собирается как debug-сборка для установки на Android. Исходный код находится в `app/src/main`.
