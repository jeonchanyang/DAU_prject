// main.js
// -----------------------------------------------------
// 0) 인트로 처리
// -----------------------------------------------------
// $(function () {
//     setTimeout(function () {
//         $(".intro").removeClass("intro");
//     }, 200);
// });

(function () {
    document.addEventListener("DOMContentLoaded", init);

    function init() {
        const fullpage = document.querySelector("#fullpage");
        if (!fullpage) return;

        const track = fullpage.querySelector(".fullpage_track");
        const sections = Array.from(fullpage.querySelectorAll(".fp_section"));
        if (!track || sections.length === 0) return;

        // ===== 유틸 =====
        const clamp = (n, min, max) => Math.max(min, Math.min(n, max));
        const scrollY = () => window.pageYOffset;
        const docH = () =>
            Math.max(document.body.scrollHeight, document.documentElement.scrollHeight);
        const maxScroll = () => Math.max(0, docH() - window.innerHeight);

        // -----------------------------------------------------
        // A) 글로벌 스무스 스크롤러 (#fullpage 캡처 바깥에서만 사용)
        // -----------------------------------------------------
        const Smooth = (() => {
            let target = scrollY();
            let current = target;
            let raf = null;
            const ease = 0.12;
            const minStep = 0.1;

            function loop() {
                const diff = target - current;
                if (Math.abs(diff) < minStep) {
                    current = target;
                    window.scrollTo(0, Math.round(current));
                    raf = null;
                    return;
                }
                current += diff * ease;
                window.scrollTo(0, Math.round(current));
                raf = requestAnimationFrame(loop);
            }

            return {
                add(deltaY) {
                    target = clamp(target + deltaY, 0, maxScroll());
                    if (!raf) raf = requestAnimationFrame(loop);
                },
                jumpTo(y) {
                    target = clamp(y, 0, maxScroll());
                    current = target;
                    window.scrollTo(0, Math.round(current));
                },
                resize() {
                    target = clamp(target, 0, maxScroll());
                    current = clamp(current, 0, maxScroll());
                },
            };
        })();

        // -----------------------------------------------------
        // B) #fullpage 상태/유틸
        // -----------------------------------------------------
        let currentIndex = 0;
        let stack = 0;
        let prevStack = 0;
        let animating = false; // #fullpage 섹션 전환 중
        let vh = window.innerHeight;
        let touchStartY = 0;

        const TRANSITION_MS = 700;
        const TRANSITION_BUFFER = 50;
        const TOL = 1;
        const TTL_MS = 60 * 60 * 1000; // fullpage 1h
        const LS_KEY = "dau:fullpage:lastIndex";

        // 첫 섹션만 스크롤 1/4로
        const FIRST_SECTION_SCROLL_FACTOR = 0.4;

        const viewportBottom = () => scrollY() + window.innerHeight;
        const fullTop = () => fullpage.getBoundingClientRect().top + scrollY();
        const fullBottom = () => fullTop() + fullpage.offsetHeight;
        const isAtFullpageBottom = () => Math.abs(fullBottom() - viewportBottom()) <= TOL;

        function applyTransform() {
            track.style.transform = `translate3d(0, ${-currentIndex * vh}px, 0)`;
        }
        function applyTransformImmediate() {
            const prev = track.style.transition;
            track.style.transition = "none";
            // reflow
            // eslint-disable-next-line no-unused-expressions
            track.offsetHeight;
            applyTransform();
            requestAnimationFrame(() => {
                track.style.transition = prev || "";
            });
        }

        // -----------------------------------------------------
        // B-1) 첫 섹션 패럴럭스 상태/렌더 (초기화 금지 + 역방향 복원)
        //  - .main_title 두 개 모두 Y이동 (오프셋이 vh 초과 시 반대방향으로 핑퐁)
        //  - .visual_img_box > img : scale은 0.6 이하로 내려가지 않음
        //  - scale이 0.6에 도달한 이후 남는 진행분은 top을 음수로 이동
        // -----------------------------------------------------
        let introProgress = 0; // 0 ~ vh
        const firstSection = sections[0];
        const introTitles = firstSection
            ? Array.from(firstSection.querySelectorAll(".main_title"))
            : [];
        const introImage = firstSection?.querySelector(".visual_img_box > img");

        const INTRO_TITLE_MAX_SHIFT_PX = 140; // 타이틀 이동 기반치(px)
        const INTRO_MIN_SCALE_CURVE = 0.85; // 계산용 목표치
        const MIN_SCALE_CAP = 0.6; // 실제 최소 스케일
        const EXTRA_TOP_MAX_PX = 220; // 캡 이후 top 최대 상승(px)

        // scale 곡선
        // ⚠️ 사용자 편집 내용 유지: slope를 3.5 - 0.85로 사용 중
        const SCALE_SLOPE = 3.5 - INTRO_MIN_SCALE_CURVE;
        const R_AT_MIN_SCALE = Math.max(0, Math.min(1, (1 - MIN_SCALE_CAP) / SCALE_SLOPE));

        function updateIntroParallax() {
            if (introTitles.length === 0 || !introImage) return;

            const r = Math.max(0, Math.min(introProgress / vh, 1)); // 0~1

            // 1) 타이틀 Y오프셋: offset*8이 vh를 넘으면 반대로 움직이도록 "핑퐁" 처리
            const offset = Math.round(r * INTRO_TITLE_MAX_SHIFT_PX); // 기본 오프셋
            const rawShift = offset * 15; // 사용자가 적용 중인 가중치
            let pingpong; // 0 -> vh까지 증가, 그 이후엔 감소(반대방향)
            if (rawShift <= vh / 1.3) {
                pingpong = rawShift; // 정방향
            } else {
                // const overflow = rawShift - vh; // 초과분
                // pingpong = Math.max(0, vh - overflow); // 역방향으로 되돌아감
            }
            // translateY: calc(50% - Xpx)
            // X가 커질수록 위로 이동하는 현재 수식을 그대로 유지하고, X를 ping-pong 처리
            introTitles.forEach((el) => {
                el.style.transform = `translate(-50%, calc(50% - ${pingpong}px))`;
            });

            // 2) 이미지 스케일 + top 리프트
            const scaleRaw = 1 - r * SCALE_SLOPE; // 1 → (아래로 갈수록 감소)
            if (r <= R_AT_MIN_SCALE) {
                // 캡 도달 전: 순수 스케일만
                introImage.style.transform = `scale(${scaleRaw})`;
                introImage.style.position = "relative";
                introImage.style.top = "0px";
            } else {
                // 캡 고정 + 초과 진행분을 top으로 전환(음수)
                const extraRatio = (r - R_AT_MIN_SCALE) / (1 - R_AT_MIN_SCALE); // 0~1
                const lift = Math.round(extraRatio * EXTRA_TOP_MAX_PX);
                introImage.style.transform = `scale(${MIN_SCALE_CAP})`;
                introImage.style.position = "relative";
                introImage.style.top = `${-lift * 3}px`;
            }
            // introImage.style.willChange = 'transform, top'; // (선택) 성능 힌트
        }

        // sub_visual 스와이프 잠금/해제
        function setSubTouchEnabled(enabled) {
            if (!subSwiper) return;
            subSwiper.allowTouchMove = !!enabled;
            subSwiper.allowSlideNext = !!enabled;
            subSwiper.allowSlidePrev = !!enabled;
        }

        function snapTo(index) {
            animating = true;
            fullpage.classList.add("is-animating");
            setSubTouchEnabled(false);

            currentIndex = clamp(index, 0, sections.length - 1);
            applyTransform();
            saveLastIndex(currentIndex);

            // 자동 원복 없음: 진행도는 손대지 않고 렌더만 갱신
            updateIntroParallax();

            setTimeout(() => {
                animating = false;
                fullpage.classList.remove("is-animating");
                setSubTouchEnabled(true);
                updateIntroParallax();
            }, TRANSITION_MS + TRANSITION_BUFFER);
        }

        function saveLastIndex(idx) {
            try {
                localStorage.setItem(
                    LS_KEY,
                    JSON.stringify({
                        idx: clamp(idx, 0, sections.length - 1),
                        ts: Date.now(),
                    })
                );
            } catch (_) {}
        }
        function loadLastIndex() {
            try {
                const raw = localStorage.getItem(LS_KEY);
                if (!raw) return 0;
                const obj = JSON.parse(raw);
                if (!obj || typeof obj.idx !== "number" || typeof obj.ts !== "number") return 0;
                if (Date.now() - obj.ts > TTL_MS) return 0;
                return clamp(obj.idx, 0, sections.length - 1);
            } catch (_) {
                return 0;
            }
        }

        // 헤더 토글 브릿지
        function emitHeaderByStackChange(newStack, oldStack) {
            if (newStack > oldStack) $(document).trigger("dau:header:hide");
            else if (newStack < oldStack) $(document).trigger("dau:header:show");
        }

        // -----------------------------------------------------
        // C) sub_visual (세로 슬라이드 + 고정 텍스트 페이드) + LS 저장/복원
        // -----------------------------------------------------
        const SUB_LS_KEY = "dau:subvisual:lastIndex";
        const SUB_TTL_MS = 60 * 60 * 1000; // 1h

        function saveSubIndex(idx, total) {
            try {
                const last = Math.max(0, Math.min(idx, total - 1));
                localStorage.setItem(SUB_LS_KEY, JSON.stringify({ idx: last, ts: Date.now() }));
            } catch (_) {}
        }
        function loadSubIndex(total) {
            try {
                const raw = localStorage.getItem(SUB_LS_KEY);
                if (!raw) return 0;
                const obj = JSON.parse(raw);
                if (!obj || typeof obj.idx !== "number" || typeof obj.ts !== "number") return 0;
                if (Date.now() - obj.ts > SUB_TTL_MS) return 0;
                return Math.max(0, Math.min(obj.idx, total - 1));
            } catch (_) {
                return 0;
            }
        }

        const subVisual = document.querySelector(".sub_visual");
        const subTitlesWrap = subVisual?.querySelector(".sub_titles_wrap");
        const subContent = subVisual?.querySelector(".sub_visual_content");

        let subSwiper = null;
        let subIndex = -1;
        let subLocalStack = 0;
        let subCooldown = false;
        let subAnimating = false;

        const subCooldownMS = 300;
        const subThreshold = () => Math.max(140, Math.floor(window.innerHeight * 0.3));

        if (subVisual && subContent) {
            // content → Swiper 래핑
            const items = Array.from(subContent.querySelectorAll(".sub_visual_item"));
            if (items.length) {
                subContent.classList.add("swiper");
                const wrapper = document.createElement("div");
                wrapper.className = "swiper-wrapper";
                items.forEach((item) => {
                    const slide = document.createElement("div");
                    slide.className = "swiper-slide";
                    slide.appendChild(item);
                    wrapper.appendChild(slide);
                });
                while (subContent.firstChild) subContent.removeChild(subContent.firstChild);
                subContent.appendChild(wrapper);
            }

            // 고정 텍스트(.sub_tilte_wrap 전체 페이드)
            const fixedBlocks = subTitlesWrap
                ? Array.from(subTitlesWrap.querySelectorAll(".sub_tilte_wrap"))
                : [];
            function activateFixedBlock(i) {
                fixedBlocks.forEach((el, idx) => {
                    const on = idx === i;
                    el.classList.toggle("is-active", on);
                    el.setAttribute("aria-hidden", on ? "false" : "true");
                });
            }

            subSwiper = new Swiper(subContent, {
                direction: "vertical",
                effect: "slide",
                speed: 700,
                loop: false,
                allowTouchMove: true,
                simulateTouch: true,
                on: {
                    init() {
                        const total = this.slides.length;
                        const restored = loadSubIndex(total);
                        if (restored > 0) {
                            this.slideTo(restored, 0);
                            activateFixedBlock(restored);
                        } else {
                            const i = this.realIndex ?? this.activeIndex ?? 0;
                            activateFixedBlock(i);
                        }
                    },
                    slideChange() {
                        const i = this.realIndex ?? this.activeIndex ?? 0;
                        activateFixedBlock(i);
                        saveSubIndex(i, this.slides.length);
                    },
                    slideChangeTransitionStart() {
                        subAnimating = true;
                    },
                    transitionStart() {
                        subAnimating = true;
                    },
                    slideChangeTransitionEnd() {
                        subAnimating = false;
                    },
                    transitionEnd() {
                        subAnimating = false;
                    },
                },
            });

            subIndex = sections.findIndex((sec) => sec.contains(subVisual));
        }

        // -----------------------------------------------------
        // D) 델타 라우팅 (sub에서 소비 → 남은 델타만 fullpage)
        // -----------------------------------------------------
        function accumulateSub(deltaY) {
            if (!subSwiper || subCooldown) return;
            subLocalStack += deltaY;

            if (Math.abs(subLocalStack) >= subThreshold()) {
                const goingDown = subLocalStack > 0;
                const i = subSwiper.realIndex ?? subSwiper.activeIndex ?? 0;
                const last = subSwiper.slides.length - 1;

                if (goingDown && i < last) subSwiper.slideNext();
                else if (!goingDown && i > 0) subSwiper.slidePrev();

                subLocalStack = 0;
                subCooldown = true;
                setTimeout(() => {
                    subCooldown = false;
                }, subCooldownMS);
            }
        }

        // sub 섹션일 때: sub가 델타를 소비하고, 엣지(첫/마지막)에서만 남은 델타를 fullpage로
        function routeDelta(deltaY) {
            if (currentIndex !== subIndex || !subSwiper) {
                return { consumed: 0, remain: deltaY };
            }

            const i = subSwiper.realIndex ?? subSwiper.activeIndex ?? 0;
            const last = subSwiper.slides.length - 1;
            const goingDown = deltaY > 0;

            if (subAnimating) {
                accumulateSub(deltaY);
                return { consumed: deltaY, remain: 0 };
            }

            if ((goingDown && i < last) || (!goingDown && i > 0)) {
                accumulateSub(deltaY);
                return { consumed: deltaY, remain: 0 };
            }

            return { consumed: 0, remain: deltaY };
        }

        // -----------------------------------------------------
        // E) #fullpage 누적/스냅
        // -----------------------------------------------------
        function accumulate(deltaY) {
            // 안전: sub/ fullpage 애니메 중이면 무시
            if ((currentIndex === subIndex && subAnimating) || animating) return;

            // 첫 섹션이면 델타를 1/4로 축소
            const effDelta = currentIndex === 0 ? deltaY * FIRST_SECTION_SCROLL_FACTOR : deltaY;

            // 첫 섹션 패럴럭스 진행도 업데이트 (섹션을 떠나도 introProgress 유지)
            if (currentIndex === 0) {
                introProgress = Math.max(0, Math.min(introProgress + effDelta, vh));
                updateIntroParallax();
            }

            const old = stack;
            stack += effDelta;

            console.log("[fullpage stack]", Math.trunc(stack));
            $(document).trigger("dau:fullpageScroll", { deltaY: effDelta, stack, prevStack: old });
            emitHeaderByStackChange(stack, old);

            updateIntroParallax();

            if (Math.abs(stack) >= vh) {
                const goingDown = stack > 0;

                // 마지막 섹션에서 아래 → 자유 스크롤
                if (goingDown && currentIndex === sections.length - 1) {
                    Smooth.add(deltaY);
                    stack = 0;
                    prevStack = 0;
                    return;
                }

                const nextIdx = currentIndex + (goingDown ? 1 : -1);
                if (nextIdx >= 0 && nextIdx < sections.length) snapTo(nextIdx);
                stack = 0;
                prevStack = 0;
            } else {
                prevStack = stack;
            }
        }

        // -----------------------------------------------------
        // F) 캡처 게이트 & 탈출 룩어헤드
        // -----------------------------------------------------
        function shouldCapture() {
            if (animating) return true;
            return isAtFullpageBottom();
        }
        function lookaheadExitToNormal(deltaY) {
            if (!isAtFullpageBottom()) return false;
            const willStack =
                stack + (currentIndex === 0 ? deltaY * FIRST_SECTION_SCROLL_FACTOR : deltaY);
            if (currentIndex === sections.length - 1 && deltaY > 0 && Math.abs(willStack) >= vh) {
                Smooth.add(deltaY);
                stack = 0;
                prevStack = 0;
                return true;
            }
            return false;
        }

        // -----------------------------------------------------
        // G) 입력 핸들러 (휠/터치)
        // -----------------------------------------------------
        function onWheel(e) {
            const deltaY = e.deltaY;

            if (animating) {
                e.preventDefault();
                return;
            }

            if (!shouldCapture()) {
                e.preventDefault();
                Smooth.add(deltaY);
                return;
            }

            if (lookaheadExitToNormal(deltaY)) {
                e.preventDefault();
                return;
            }

            const { consumed, remain } = routeDelta(deltaY);
            if (consumed !== 0) e.preventDefault();
            if (remain === 0) return;

            e.preventDefault();
            accumulate(remain);
        }

        function onTouchStart(e) {
            if (e.touches && e.touches.length > 0) touchStartY = e.touches[0].clientY;
        }
        function onTouchMove(e) {
            if (!e.touches || e.touches.length === 0) return;
            const currentY = e.touches[0].clientY;
            const deltaY = touchStartY - currentY; // 양수=아래

            if (animating) {
                e.preventDefault();
                return;
            }

            if (!shouldCapture()) {
                e.preventDefault();
                Smooth.add(deltaY);
                return;
            }

            if (lookaheadExitToNormal(deltaY)) {
                e.preventDefault();
                return;
            }

            const { consumed, remain } = routeDelta(deltaY);
            if (consumed !== 0) e.preventDefault();
            if (remain === 0) return;

            e.preventDefault();
            accumulate(remain);
        }

        function onResize() {
            vh = window.innerHeight;
            applyTransform();
            Smooth.resize();
            // 진행도/렌더 보정
            introProgress = Math.max(0, Math.min(introProgress, vh));
            updateIntroParallax();
        }

        // 초기 복원
        currentIndex = loadLastIndex();
        applyTransformImmediate();
        // 섹션 0이 아니면 패럴럭스는 최대로 고정(떠난 상태 유지)
        introProgress = currentIndex > 0 ? vh : 0;
        updateIntroParallax();

        // 바인딩
        window.addEventListener("wheel", onWheel, { passive: false });
        window.addEventListener("touchstart", onTouchStart, { passive: true });
        window.addEventListener("touchmove", onTouchMove, { passive: false });
        window.addEventListener("resize", onResize);

        // -----------------------------------------------------
        // H) PROJECT 가로 스와이퍼 (#project .swiper)
        // -----------------------------------------------------
        (function initProjectSwiper() {
            const host = document.querySelector("#project");
            if (!host) return;

            if (host.__inited) return;
            host.__inited = true;

            // 기존 .swiper_item들을 .swiper-wrapper/.swiper-slide로 래핑
            const items = Array.from(host.querySelectorAll(".swiper_item"));
            if (!items.length) return;

            const wrapper = document.createElement("div");
            wrapper.className = "swiper-wrapper";

            items.forEach((item) => {
                const slide = document.createElement("div");
                slide.className = "swiper-slide";
                slide.appendChild(item);
                wrapper.appendChild(slide);
            });

            while (host.firstChild) host.removeChild(host.firstChild);
            host.appendChild(wrapper);

            // 컨트롤 UI(불릿 + 재생/정지)
            const controls = document.createElement("div");
            controls.className = "project-controls";
            const pagination = document.createElement("div");
            pagination.className = "swiper-pagination";
            const toggle = document.createElement("button");
            toggle.type = "button";
            toggle.className = "swiper-play-toggle";
            toggle.setAttribute("aria-pressed", "true"); // true = 재생중
            toggle.setAttribute("aria-label", "Pause autoplay");
            toggle.textContent = "Pause";

            controls.appendChild(pagination);
            controls.appendChild(toggle);

            const wrap = host.closest(".swiper_wrap") || host.parentElement;
            (wrap || host).appendChild(controls);

            // 좌/우 네비게이션 버튼
            const prevBtn = document.createElement("div");
            prevBtn.className = "swiper-button-prev";
            prevBtn.setAttribute("aria-label", "Previous slide");

            const nextBtn = document.createElement("div");
            nextBtn.className = "swiper-button-next";
            nextBtn.setAttribute("aria-label", "Next slide");

            (wrap || host).appendChild(prevBtn);
            (wrap || host).appendChild(nextBtn);

            // Swiper 초기화
            const projectSwiper = new Swiper(host, {
                direction: "horizontal",
                slidesPerView: 1,
                spaceBetween: 24,
                loop: true,
                speed: 600,
                allowTouchMove: true,
                simulateTouch: true,
                grabCursor: true,
                nested: true,
                touchAngle: 30,
                threshold: 8,
                pagination: {
                    el: pagination,
                    clickable: true,
                },
                navigation: {
                    nextEl: nextBtn,
                    prevEl: prevBtn,
                },
                autoplay: {
                    delay: 3500,
                    disableOnInteraction: false,
                    pauseOnMouseEnter: true,
                },
            });

            // 재생/정지 토글
            function setPaused(paused) {
                if (paused) {
                    projectSwiper.autoplay.stop();
                    toggle.setAttribute("aria-pressed", "false");
                    toggle.setAttribute("aria-label", "Resume autoplay");
                    toggle.textContent = "Play";
                    toggle.classList.add("is-paused");
                } else {
                    projectSwiper.autoplay.start();
                    toggle.setAttribute("aria-pressed", "true");
                    toggle.setAttribute("aria-label", "Pause autoplay");
                    toggle.textContent = "Pause";
                    toggle.classList.remove("is-paused");
                }
            }
            toggle.addEventListener("click", () => {
                const isPlaying = toggle.getAttribute("aria-pressed") === "true";
                setPaused(isPlaying); // 재생중이면 pause, 멈춤이면 play
            });

            setPaused(false); // 초기 상태: 재생중
        })();
        // -----------------------------------------------------
        // I) PR 가로 스와이퍼 (#pr .fp_section_contents .swiper)
        //     - 자동재생 없음, 터치/마우스 드래그 가능
        //     - 불릿 페이징
        //     - 각 슬라이드 내부 .indicator 의 current/total 갱신
        // -----------------------------------------------------
        (function initPRSwiper() {
            const prHost = document.querySelector("#pr .fp_section_contents .swiper");
            if (!prHost) return;
            if (prHost.__inited) return;
            prHost.__inited = true;

            // 기존 .swiper_item → .swiper-wrapper/.swiper-slide 래핑
            const items = Array.from(prHost.querySelectorAll(".swiper_item"));
            if (!items.length) return;

            const wrapper = document.createElement("div");
            wrapper.className = "swiper-wrapper";

            items.forEach((item) => {
                const slide = document.createElement("div");
                slide.className = "swiper-slide";
                slide.appendChild(item);
                wrapper.appendChild(slide);
            });

            while (prHost.firstChild) prHost.removeChild(prHost.firstChild);
            prHost.appendChild(wrapper);

            // 페이징 불릿
            const pagination = document.createElement("div");
            pagination.className = "swiper-pagination";
            prHost.parentElement.appendChild(pagination);

            // 두 자리 포맷터
            const pad2 = (n) => String(n).padStart(2, "0");

            const prSwiper = new Swiper(prHost, {
                direction: "horizontal",
                slidesPerView: 1,
                spaceBetween: 24,
                loop: false,
                speed: 600,
                allowTouchMove: true,
                simulateTouch: true,
                grabCursor: true,
                nested: true, // fullpage와 충돌 방지
                touchAngle: 30,
                threshold: 6,
                // pagination: {
                //     el: pagination,
                //     clickable: true,
                // },
                on: {
                    init() {
                        const total = this.slides.length;
                        // 모든 슬라이드의 total 표기 업데이트
                        document
                            .querySelectorAll("#pr .indicator .total")
                            .forEach((el) => (el.textContent = pad2(total)));

                        // 현재 활성 슬라이드 current 업데이트
                        const idx = (this.realIndex ?? this.activeIndex ?? 0) + 1;
                        const activeSlide = this.slides[this.activeIndex];
                        if (activeSlide) {
                            const cur = activeSlide.querySelector(".indicator .current");
                            if (cur) cur.textContent = pad2(idx);
                        }
                    },
                    slideChange() {
                        const total = this.slides.length;
                        const idx = (this.realIndex ?? this.activeIndex ?? 0) + 1;

                        // active 슬라이드의 current만 갱신
                        const activeSlide = this.slides[this.activeIndex];
                        if (activeSlide) {
                            const cur = activeSlide.querySelector(".indicator .current");
                            if (cur) cur.textContent = pad2(idx);
                            const tot = activeSlide.querySelector(".indicator .total");
                            if (tot) tot.textContent = pad2(total);
                        }
                    },
                },
            });
        })();
    }
})();
