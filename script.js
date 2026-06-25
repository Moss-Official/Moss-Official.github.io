let currentTrackIndex = -1;

document.addEventListener('DOMContentLoaded', () => {
    const canvas = document.getElementById('visualizer');
    const ctx = canvas.getContext('2d');

    let audioContext;
    let analyser;
    let source;
    let dataArray;
    let bufferLength;
    let tracksToRender;

    const navButtons = document.querySelectorAll('.nav-btn');
    const tabs = document.querySelectorAll('.tab-content');
    
    const audioPlayer = document.getElementById('audio-player');
    const videoModal = document.getElementById('video-modal');
    const videoPlayer = document.getElementById('video-player');
    const closeModal = document.querySelector('.close-modal');

    // Элементы плеера
    const miniPlayer = document.getElementById('mini-player');
    const miniCover = document.getElementById('mini-player-cover');
    const miniTitle = document.getElementById('mini-player-title');
    const miniAuthor = document.getElementById('mini-player-author');
    const miniToggleBtn = document.getElementById('mini-player-toggle');
    const playerCloseBtn = document.getElementById('player-close');
    const prevBtn = document.getElementById('prev-btn');
    const nextBtn = document.getElementById('next-btn');
    
    // Элементы дорожки времени
    const playerSlider = document.getElementById('player-slider');
    const timeCurrent = document.getElementById('time-current');
    const timeDuration = document.getElementById('time-duration');

    // Переменные для экстраполяции времени (убираем рывки)
    let isUserDragging = false;
    let animationFrameId = null;
    let lastAudioTime = 0;
    let lastSystemTime = 0;

    // Шаг ползунка делаем максимально мелким для плавности хода точки
    playerSlider.step = "0.01";

    const tracks = JSON.parse(data).tracks;

    // Переключение вкладок
    navButtons.forEach(button => {
        button.addEventListener('click', () => {
            const targetTab = button.getAttribute('data-tab');
            navButtons.forEach(btn => btn.classList.remove('active'));
            button.classList.add('active');
            tabs.forEach(tab => tab.classList.remove('active'));
            document.getElementById(targetTab).classList.add('active');

            if (targetTab === 'tab-tracks') {
                loadTracks();
            } else if (targetTab === 'tab-clips') {
                loadClips();
            }
            else if (targetTab === 'tab-voting') {
                loadVoting();
            }
        });
    });

    // Функция перевода секунд в формат 0:00
    function formatTime(seconds) {
        if (isNaN(seconds) || seconds < 0) return "0:00";
        const mins = Math.floor(seconds / 60);
        const secs = Math.floor(seconds % 60);
        return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
    }

    // Раскрытие плеера на полный экран
    miniPlayer.addEventListener('click', (e) => {
        if (e.target === miniToggleBtn || e.target === playerCloseBtn || e.target === playerSlider || e.target === prevBtn || e.target === nextBtn) {
            return;
        }
        miniPlayer.classList.add('expanded');

        drawVisualizer();

        setTimeout(() => {
            updateMiniPlayerProgress(playerSlider.value);
        }, 0);
    });

    // Сворачивание плеера (крестик)
    playerCloseBtn.addEventListener('click', () => {
        miniPlayer.classList.remove('expanded');
    });

    // Управление воспроизведением (Плей/Пауза)
    miniToggleBtn.addEventListener('click', () => {
        if (audioPlayer.paused) {
            audioPlayer.play();
        } else {
            audioPlayer.pause();
        }
    });

    // Идеально плавная отрисовка на основе системного времени ПК
    function smoothUpdate() {
        if (!isUserDragging && !audioPlayer.paused) {
            const duration = audioPlayer.duration || 0;
            
            if (duration > 0) {
                // Вычисляем, сколько миллисекунд прошло с момента последнего обновления от аудио-тега
                const now = performance.now();
                const elapsedSinceLastUpdate = (now - lastSystemTime) / 1000;
                
                // Экстраполируем (предсказываем) текущее положение трека
                let estimatedTime = lastAudioTime + elapsedSinceLastUpdate;
                if (estimatedTime > duration) estimatedTime = duration;

                timeCurrent.textContent = formatTime(estimatedTime);
                
                
                const percent = (estimatedTime / duration) * 100;
                playerSlider.value = percent;
                updateSliderProgress(percent);
                updateMiniPlayerProgress(percent);
            }
        }
        
        if (!audioPlayer.paused) {
            animationFrameId = requestAnimationFrame(smoothUpdate);
        }
    }

    // Синхронизируем экстраполяцию при каждом реальном обновлении от браузера
    audioPlayer.addEventListener('timeupdate', () => {
        lastAudioTime = audioPlayer.currentTime;
        lastSystemTime = performance.now();
    });

    // Когда трек полностью загрузился — обновляем общую длительность
    audioPlayer.addEventListener('loadedmetadata', () => {
        timeDuration.textContent = formatTime(audioPlayer.duration);
    });

    // Перемотка трека ползунком (пользователь тянет)
    playerSlider.addEventListener('input', () => {
        isUserDragging = true;
        const duration = audioPlayer.duration || 0;
        const newTime = (playerSlider.value / 100) * duration;
        timeCurrent.textContent = formatTime(newTime);
    
        updateSliderProgress(playerSlider.value);
        updateMiniPlayerProgress(playerSlider.value);
    });

    // Пользователь отпустил ползунок (применяем новое время)
    playerSlider.addEventListener('change', () => {
        const duration = audioPlayer.duration || 0;
        const newTime = (playerSlider.value / 100) * duration;
        
        audioPlayer.currentTime = newTime;
        lastAudioTime = newTime;
        lastSystemTime = performance.now();
        isUserDragging = false;
        
        if (!audioPlayer.paused) {
            cancelAnimationFrame(animationFrameId);
            animationFrameId = requestAnimationFrame(smoothUpdate);
        }
    });

    // Синхронизация статуса UI (играет/пауза)
    function updatePlaybackUI() {
        if (audioPlayer.paused) {
            miniToggleBtn.textContent = '▶';
            cancelAnimationFrame(animationFrameId);
            document.querySelectorAll('#tracks-list .media-item').forEach(el => el.classList.remove('playing'));
        } else {
            miniToggleBtn.textContent = '⏸';
            
            lastAudioTime = audioPlayer.currentTime;
            lastSystemTime = performance.now();
            
            cancelAnimationFrame(animationFrameId);
            animationFrameId = requestAnimationFrame(smoothUpdate);

            document.querySelectorAll('#tracks-list .media-item').forEach(item => {
                const trackDir = item.getAttribute('data-dir');
                if (audioPlayer.src.includes(encodeURIComponent(trackDir))) {
                    item.classList.add('playing');
                } else {
                    item.classList.remove('playing');
                }
            });
        }
    }

    audioPlayer.addEventListener('play', () => {
        initVisualizer();
    
        if (audioContext.state === 'suspended') {
            audioContext.resume();
        }
    
        drawVisualizer();
        updatePlaybackUI();
    });
    audioPlayer.addEventListener('pause', updatePlaybackUI);
    audioPlayer.addEventListener('ended', () => {
        miniToggleBtn.textContent = '▶';
        playerSlider.value = 0;
        updateSliderProgress(0);
        updateMiniPlayerProgress(0);
        timeCurrent.textContent = "0:00";
        cancelAnimationFrame(animationFrameId);
        document.querySelectorAll('#tracks-list .media-item').forEach(el => el.classList.remove('playing'));

        if (currentTrackIndex < tracks.length - 1) {
            playTrack(currentTrackIndex + 1);
        }
    });

    function loadVoting() {
        const container = document.getElementById('voting-container');
        const favoriteSelect = document.getElementById("favoriteTrackSelect");
        favoriteSelect.innerHTML = "";
        container.innerHTML = '';
    
        tracks.forEach((track, index) => {
            const option = document.createElement("option");
            option.value = track.track_name;

            option.textContent = `${track.author} - ${track.track_name}`;

            favoriteSelect.appendChild(option);

            const card = document.createElement('div');
            card.className = 'vote-card';
    
            card.innerHTML = `
                <div class="vote-title">
                    <img src="${track.flag_dir}" class="vote-flag">
                    ${track.author} — ${track.track_name}
                </div>

                <input 
                    type="range" 
                    min="1" 
                    max="10" 
                    step="1" 
                    value="5"
                    class="vote-slider"
                    data-index="${index}"
                >

                <div class="vote-footer">
                    <div class="vote-person">${track.person}</div>
                    <div class="vote-value">Оценка: <span>5</span></div>
                </div>
            `;
    
            const slider = card.querySelector('.vote-slider');
            const valueText = card.querySelector('.vote-value span');
    
            slider.addEventListener('input', () => {
                valueText.textContent = slider.value;
            });
    
            container.appendChild(card);
        });
    }

    // Парсинг треков
    async function loadTracks() {
        const container = document.getElementById('tracks-list');
        container.innerHTML = 'Загрузка треков...';

        try {
            //const response = await fetch('data.json');
            //const data = await response.json();
            container.innerHTML = '';
            const hasResults = tracks.some(track => track.points > 0);
            
            let currentPlace = 1;
        
            tracksToRender = [...tracks];

            if (hasResults) {
              tracksToRender.sort((a, b) => b.points - a.points);
            }

            tracksToRender.forEach((track, index) => {
                
                if (!hasResults) {
                  track.place = null;
                  return;
                }
            
                if (index === 0) {
                  track.place = 1;
                } else {
                  const prevTrack = tracksToRender[index - 1];
            
                  if (track.points === prevTrack.points) {
                    // одинаковые очки → то же место
                    track.place = prevTrack.place;
                  } else {
                    // разные очки → увеличиваем место на 1
                    currentPlace++;
                    track.place = currentPlace;
                  }
                }

                const item = document.createElement('div');
                item.className = 'media-item';
                if (track.place === 1) {
                    item.classList.add("first-place");
                }
                else if (track.place === 2) {
                    item.classList.add("second-place");
                }
                else if (track.place === 3) {
                    item.classList.add("third-place");
                }
                
                item.setAttribute('data-dir', track.track_dir);
                
                if (audioPlayer.src.includes(encodeURIComponent(track.track_dir)) && !audioPlayer.paused) {
                    item.classList.add('playing');
                }

                item.innerHTML = `
                  ${hasResults ? `<div class="track-place">${track.place}</div>` : ""}

                  <img src="${track.track_cover_dir}" class="cover-art">

                  <img src="${track.flag_dir}" class="track-flag">

                  <div class="media-info">
                    <div class="media-title">${track.track_name}</div>
                    <div class="media-author">${track.author}</div>
                  </div>

                  ${hasResults ? `<div class="track-points">${track.points}</div>` : ""}
                `;
                /*`
                    <img src="${track.track_cover_dir}" class="cover-art">

                    <img src="${track.flag_dir}" class="track-flag">

                    <div class="media-info">
                        <div class="media-title">${track.track_name}</div>
                        <div class="media-author">${track.author}</div>
                    </div>
                `;*/

                item.addEventListener('click', () => {
                    const isCurrentTrack = audioPlayer.src.includes(encodeURIComponent(track.track_dir));
                    
                    if (isCurrentTrack) {
                        if (audioPlayer.paused) {
                            audioPlayer.play();
                        } else {
                            audioPlayer.pause();
                        }
                    } else {
                        

                        playTrack(index);

                        /**/
                    }
                });

                container.appendChild(item);
            });
        } catch (error) {
            container.innerHTML = 'Ошибка загрузки треков.';
            console.error(error);
        }
    }

    // Парсинг клипов
    async function loadClips() {
        const container = document.getElementById('clips-list');
        container.innerHTML = 'Загрузка клипов...';

        try {
            //const response = await fetch('data.json');
            //const data = await response.json();
            container.innerHTML = '';

            JSON.parse(data).clips.forEach(clip => {
                const item = document.createElement('div');
                item.className = 'media-item';
                item.innerHTML = `
                    <div class="clip-icon-box">🎬</div>
                    <div class="media-info">
                        <div class="media-title">${clip.clip_name}</div>
                        <div class="media-author">${clip.author}</div>
                    </div>
                `;

                item.addEventListener('click', () => {
                    audioPlayer.pause();
                    videoPlayer.src = clip.clip_dir;
                    videoModal.style.display = 'flex';
                    videoPlayer.play();
                });
                
                container.appendChild(item);
            });
        } catch (error) {
            container.innerHTML = 'Ошибка загрузки клипов.';
            console.error(error);
        }
    }
    
    function stopVideo() {
        videoModal.style.display = 'none';
        videoPlayer.pause();
        videoPlayer.src = '';
    }

    function updateSliderProgress(value) {
        playerSlider.style.background = `linear-gradient(to right, 
            var(--accent-color) ${value}%, 
            #555 ${value}%)`;
    }

    function updateMiniPlayerProgress(value) {
        // Если плеер РАЗВЁРНУТ — убираем прогресс
        if (miniPlayer.classList.contains('expanded')) {
            miniPlayer.style.background = 'var(--player-bg)';
            return;
        }
    
        // Если СВЁРНУТ — рисуем прогресс
        miniPlayer.style.background = `linear-gradient(to right,
            var(--accent-color-dark) ${value}%,
            var(--player-bg) ${value}%)`;
    }

    function updateActiveTrack() {
        const items = document.querySelectorAll('.media-item');
        
        items.forEach((item, index) => {
            item.classList.toggle('active', index === currentTrackIndex);
        });
    }
    
    closeModal.addEventListener('click', stopVideo);
    videoModal.addEventListener('click', (e) => {
        if (e.target === videoModal) {
            stopVideo();
        }
    });
    
    prevBtn.addEventListener('click', () => {
        if (currentTrackIndex > 0) {
            playTrack(currentTrackIndex - 1);
        }
    });
    
    nextBtn.addEventListener('click', () => {
        if (currentTrackIndex < tracks.length - 1) {
            playTrack(currentTrackIndex + 1);
        }
    });

    function playTrack(index) {
        const playerCountry = document.getElementById('player-country');
        const playerPerson = document.getElementById('player-person');
        const track = tracksToRender[index];
        
        playerCountry.innerHTML = `
            <img src="${track.flag_dir}" class="player-flag">
            ${track.country}
        `;

        playerPerson.textContent = `Участник: ${track.person}`;
    
        audioPlayer.src = track.track_dir;
        miniTitle.textContent = track.track_name;
        miniCover.src = track.track_cover_dir;
        miniAuthor.textContent = track.author;
        miniPlayer.classList.add('active');
        currentTrackIndex = index;
        updateActiveTrack();
        audioPlayer.play();
    }

    function initVisualizer() {
        if (audioContext) return;
    
        audioContext = new (window.AudioContext || window.webkitAudioContext)();
        analyser = audioContext.createAnalyser();
    
        source = audioContext.createMediaElementSource(audioPlayer);
        source.connect(analyser);
        analyser.connect(audioContext.destination);
    
        analyser.fftSize = 128;
        bufferLength = analyser.frequencyBinCount;
        dataArray = new Uint8Array(bufferLength);
    }

    function drawVisualizer() {
        if (!miniPlayer.classList.contains('expanded')) return;
    
        requestAnimationFrame(drawVisualizer);
    
        analyser.getByteFrequencyData(dataArray);
    
        canvas.width = canvas.offsetWidth;
        canvas.height = canvas.offsetHeight;
    
        ctx.clearRect(0, 0, canvas.width, canvas.height);
    
        const barWidth = canvas.width / bufferLength;
    
        for (let i = 0; i < bufferLength; i++) {
            const value = dataArray[i];
            const percent = value / 255;
            const height = canvas.height * percent;
    
            const x = i * barWidth;
            const y = canvas.height - height;
    
            ctx.fillStyle = getComputedStyle(document.documentElement)
                .getPropertyValue('--accent-color');
    
            ctx.fillRect(x, y, barWidth - 2, height);
        }
    }
});