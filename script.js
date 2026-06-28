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
        // ---
        const submitBtn = document.getElementById("submit-votes"); // твоя кнопка
        const modal = document.getElementById("voteModal");

        const loginBtn = document.getElementById("loginBtn");

        // Переменные для экстраполяции времени (убираем рывки)
        let isUserDragging = false;
        let animationFrameId = null;
        let lastAudioTime = 0;
        let lastSystemTime = 0;

        // Шаг ползунка делаем максимально мелким для плавности хода точки
        playerSlider.step = "0.01";

        const data_json = JSON.parse(data);

        let currentYear = "2026";

        function getCurrentData() {
            return data_json[currentYear];
        }

        function getTracks() {
            return getCurrentData().tracks;
        }

        function getClips() {
            return getCurrentData().clips;
        }

        if (localStorage.getItem("loggedIn") === "true") {
            document.getElementById("authOverlay").style.display = "none";
        }

        const yearSelect = document.getElementById("yearSelect");

        yearSelect.addEventListener("change", () => {
            currentYear = yearSelect.value;
        
            // перезагружаем текущую вкладку
            const activeTab = document.querySelector('.tab-content.active').id;
        
            if (activeTab === 'tab-tracks') loadTracks();
            if (activeTab === 'tab-clips') loadClips();
            if (activeTab === 'tab-voting') loadVoting();
        });

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

        loginBtn.addEventListener("click", () => {
            const username = document.getElementById("usernameInput").value.trim();
            const password = document.getElementById("passwordInput").value.trim();
            
            const user = data_json.accounts.find(acc => 
            acc.username === username && acc.password === password
            );
        
            if (!user) {
            alert("Неверный логин или пароль");
            
            document.getElementById("usernameInput").value = "";
            document.getElementById("passwordInput").value = "";
            return;
            }
        
            // успешный вход
            document.getElementById("authOverlay").style.display = "none";
            localStorage.setItem("loggedIn", "true");
            localStorage.setItem("username", username);
        });

        submitBtn.addEventListener("click", () => {
            modal.classList.remove("hidden");
        });

        document.getElementById("closeModal").addEventListener("click", () => {
            modal.classList.add("hidden");
        });

        document.getElementById("confirmVoteBtn").addEventListener("click", () => {
            modal.classList.add("hidden");
        
            sendVotingToTelegram();
        });

        modal.addEventListener("click", (e) => {
        if (e.target === modal) {
            modal.classList.add("hidden");
        }
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
                miniToggleBtn.src = "Media/UI/play.png";
                cancelAnimationFrame(animationFrameId);
                document.querySelectorAll('#tracks-list .media-item').forEach(el => el.classList.remove('playing'));
            } else {
                miniToggleBtn.src = "Media/UI/pause.png";
                
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
            if (currentTrackIndex < tracksToRender.length - 1) {
                playTrack(currentTrackIndex + 1);
            }
        });

        function loadVoting() {
            document.getElementById("toolbar-vote").src = "Media/UI/vote_chosen.png";
            document.getElementById("toolbar-tracks").src = "Media/UI/tracks.png";
            document.getElementById("toolbar-clips").src = "Media/UI/clips.png";

            const tracks = getTracks();

            if (currentYear !== "2026") {
                document.getElementById("tab-voting").innerHTML = 
                    "Голосование за этот год уже завершено.";
                return;
            }
            else {
                document.getElementById("tab-voting").innerHTML = `
                <div id="voting-container" class="voting-container">
                
                </div>
                <div class="vote-card favorite-track-card">
                    <div class="vote-card-title">
                      Выберите трек, который Вам понравился больше всего:
                    </div>
                
                    <select id="favoriteTrackSelect" class="favorite-track-select">
                      <!-- опции будут добавляться через JS -->
                    </select>
                </div>
                <button id="submit-votes" class="submit-btn">Отправить</button>
                `

                document.getElementById("submit-votes").addEventListener("click", () => {
                    modal.classList.remove("hidden");
                });
            }

            const container = document.getElementById('voting-container');
            const favoriteSelect = document.getElementById("favoriteTrackSelect");
            favoriteSelect.innerHTML = "";
            container.innerHTML = '';

            if (localStorage.getItem("voted") === "true") {
                document.getElementById("tab-voting").innerHTML = "Ой! Кажется, голосовать уже нельзя(";
            }
        
            tracks.forEach((track, index) => {
                const option = document.createElement("option");
                option.value = `${track.author} - ${track.track_name}`;

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
                    track.votePoints = slider.value;
                });
        
                container.appendChild(card);
            });
        }

        // Парсинг треков
        async function loadTracks() {
            document.getElementById("toolbar-vote").src = "Media/UI/vote.png";
            document.getElementById("toolbar-tracks").src = "Media/UI/tracks_chosen.png";
            document.getElementById("toolbar-clips").src = "Media/UI/clips.png";

            const container = document.getElementById('tracks-list');
            container.innerHTML = 'Загрузка треков...';

            try {
                //const response = await fetch('data.json');
                //const data = await response.json();
                container.innerHTML = '';
                
                const tracks = getTracks();

                const hasResults = tracks.some(track => track.points > 0);
                tracksToRender = [...tracks];
                
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
            document.getElementById("toolbar-vote").src = "Media/UI/vote.png";
            document.getElementById("toolbar-tracks").src = "Media/UI/tracks.png";
            document.getElementById("toolbar-clips").src = "Media/UI/clips_chosen.png";

            /*const container = document.getElementById('clips-list');
            container.innerHTML = 'Загрузка клипов...';

            try {
                //const response = await fetch('data.json');
                //const data = await response.json();
                container.innerHTML = '';

                getClips().forEach(clip => {
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
            }*/

            const container = document.getElementById("clips-container");
            container.innerHTML = "";

            getClips().forEach(clip => {
                const card = document.createElement("div");
                card.className = "clip-card";
        
                const preview = document.createElement("img");
                preview.className = "clip-preview";
        
                // если нет preview — можно поставить заглушку
                preview.src = clip.preview_dir || "Media/default_preview.png";
        
                const info = document.createElement("div");
                info.className = "clip-info";
        
                const title = document.createElement("div");
                title.className = "clip-title";
                title.textContent = clip.clip_name;
        
                const author = document.createElement("div");
                author.className = "clip-author";
                author.textContent = clip.author;
        
                info.appendChild(title);
                info.appendChild(author);
        
                card.appendChild(preview);
                card.appendChild(info);
        
                // ▶️ клик — открыть видео
                card.addEventListener("click", () => {
                    openClipPlayer(clip.clip_dir);
                });
        
                container.appendChild(card);
            });
        }

        function openClipPlayer(src) {
            const modal = document.createElement("div");
            modal.className = "video-modal";
        
            modal.innerHTML = `
                <div class="video-content">
                    <span class="close-video">&times;</span>
                    <video controls autoplay>
                        <source src="${src}" type="video/mp4">
                    </video>
                </div>
            `;
        
            document.body.appendChild(modal);
        
            modal.querySelector(".close-video").onclick = () => {
                modal.remove();
            };
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
            if (currentTrackIndex < tracksToRender.length - 1) {
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

        function sendVotingToTelegram()
        {
            const token = '8856967471:AAFid5LdnOqSrbYiSNxmyqfy3-2CcIUN_lM';
            const chatId = '5668984243';
            let message = `Голоса от ${localStorage.getItem("username")}:\n\n`

            getTracks().forEach((track, index) => {
                message += `${track.author} - ${track.track_name}: ${track.votePoints ? track.votePoints : "5"} баллов\n`;
            });
            
            const favoriteSelect = document.getElementById("favoriteTrackSelect");
            const favoriteTrack = favoriteSelect ? favoriteSelect.value : "Не выбран";
            
            message += `\nЛюбимый трек: ${favoriteTrack}`;

            fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                chat_id: chatId,
                text: message,
                parse_mode: 'HTML'
            })
            })
            .then(res => {
            if (res.ok) {
                alert("Заявка отправлена!");
                localStorage.setItem("voted", "true");
            } else {
                alert("Ошибка при отправке заявки.");
            }
            })
            .catch(err => {
            console.error("Ошибка:", err);
            alert("Ошибка при подключении.");
            });
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

        loadTracks();
    });
