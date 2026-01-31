// ==========================================
// SECURITY GATEKEEPER
// ==========================================
(function() {
    // 1. Check if we are on the Login Page (index.html or auth.html)
    const path = window.location.pathname;
    const isLoginPage = path.includes('index.html') || path.includes('auth.html') || path === '/';

    // 2. Check if User is Logged In
    const userPin = localStorage.getItem("userPIN"); // OR "user_pin" depending on your storage key

    // 3. Logic:
    // If we are NOT on the login page AND we don't have a PIN...
    if (!isLoginPage && !userPin) {
        console.warn("Unauthorized Access! Redirecting...");
        window.location.href = "index.html"; // Kick them out!
    }
})();

console.log("Script Loaded - V18 (Redirect Fixed)");

import { initializeApp } from "https://www.gstatic.com/firebasejs/9.6.1/firebase-app.js";
import { getFirestore, doc, setDoc, getDoc } from "https://www.gstatic.com/firebasejs/9.6.1/firebase-firestore.js";
import { getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword } from "https://www.gstatic.com/firebasejs/9.6.1/firebase-auth.js";

const firebaseConfig = {
  apiKey: "AIzaSyDpN_1iAlE6K7YEeKOt5fMnPqMo5eNodBM",
  authDomain: "student-data-analysis-85831.firebaseapp.com",
  projectId: "student-data-analysis-85831",
  storageBucket: "student-data-analysis-85831.firebasestorage.app",
  messagingSenderId: "739540856409",
  appId: "1:739540856409:web:155e5d3efb17211aff8b48",
  measurementId: "G-Y0VK71KDB1"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);

// ===============================================
// 1. ANALYTICS LOGIC
// ===============================================

function calculateSubjectStats(leaderboard, myPin) {
    const subjectsMap = {}; 

    leaderboard.forEach(student => {
        if(student.raw_report && Array.isArray(student.raw_report)) {
            student.raw_report.forEach(sub => {
                const name = sub.SubjectName;
                const marks = parseFloat(sub.SubjectTotal || 0);
                
                if(!subjectsMap[name]) subjectsMap[name] = { all_marks: [], mine: 0 };
                
                if(marks > 0) subjectsMap[name].all_marks.push(marks);
                if(student.pin === myPin) subjectsMap[name].mine = marks;
            });
        }
    });

    const stats = [];
    for(const [name, data] of Object.entries(subjectsMap)) {
        if(data.all_marks.length > 0) {
            const sum = data.all_marks.reduce((a,b)=>a+b, 0);
            stats.push({
                name: name,
                top: Math.max(...data.all_marks),
                low: Math.min(...data.all_marks),
                avg: (sum / data.all_marks.length).toFixed(1),
                mine: data.mine
            });
        }
    }
    return stats;
}

window.startAnalysis = async function() {
    const pin = document.getElementById('pinInput').value.trim().toUpperCase();
    if(!pin) return alert("Enter PIN");

    document.getElementById('inputView').classList.add('hidden');
    document.getElementById('loadingView').classList.remove('hidden');
    document.getElementById('loadingView').style.opacity = '1';

    let progress = 0;
    const bar = document.getElementById('barFill');
    const txt = document.getElementById('percentText');
    const ring = document.getElementById('ring');
    const status = document.getElementById('statusLabel');

    const interval = setInterval(() => {
        if(progress < 90) {
            progress += 0.5;
            const offset = 565 - (progress / 100) * 565;
            ring.style.strokeDashoffset = offset;
            bar.style.width = progress + '%';
            txt.innerHTML = Math.floor(progress) + '<span>%</span>';
            if(progress > 20) status.innerText = "Fetching Class Results...";
            if(progress > 60) status.innerText = "Calculating Subject Analysis...";
        }
    }, 50);

    try {
        const response = await fetch('http://127.0.0.1:5000/api/analyze', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ pin: pin })
        });

        const json = await response.json();

        if(response.ok && json.status === "success") {
            const data = json.data;
            const me = data.me_smart || { name: "Unknown", sgpa: 0 };
            const leaderboard = data.leaderboard || [];
            
            // --- CALCULATION LOGIC ---
            const sgpas = leaderboard.map(s => s.sgpa).filter(v => v > 0);
            const classStats = {
                top: sgpas.length ? Math.max(...sgpas) : 0,
                low: sgpas.length ? Math.min(...sgpas) : 0,
                avg: sgpas.length ? (sgpas.reduce((a,b)=>a+b,0)/sgpas.length).toFixed(2) : 0
            };

            const subStats = calculateSubjectStats(leaderboard, pin);

            // Save to Firebase (Analytics Data)
            await setDoc(doc(db, "class_results", pin), {
                name: me.name,
                pin: me.pin,
                branch: me.branch || "GEN",
                avg_sgpa: me.sgpa,
                credits: me.credits || 0,
                class_stats: classStats,
                last_updated: new Date().toISOString()
            });

            // Save to LocalStorage
            localStorage.setItem("user_pin", pin);
            localStorage.setItem("leaderboard_data", JSON.stringify(leaderboard));
            localStorage.setItem("my_detailed_history", JSON.stringify(data.me_history_detailed));
            localStorage.setItem("class_stats", JSON.stringify(classStats));
            localStorage.setItem("my_sgpa", me.sgpa);
            localStorage.setItem("subject_stats", JSON.stringify(subStats)); 

            clearInterval(interval);
            ring.style.strokeDashoffset = 0;
            bar.style.width = '100%';
            txt.innerHTML = '100<span>%</span>';
            status.innerText = "Success!";
            
            setTimeout(() => window.location.href = "dashboard.html", 800);

        } else {
            alert("API Error: " + (json.message || "Unknown"));
            location.reload();
        }

    } catch (e) {
        clearInterval(interval);
        console.error(e);
        alert("Connection Error. Ensure Proxy is running.");
        location.reload();
    }
};

// --- DASHBOARD LOADER ---
if(window.location.pathname.includes('dashboard.html')) {
    const pin = localStorage.getItem("user_pin");
    const statsRaw = localStorage.getItem("class_stats");
    const mySgpa = localStorage.getItem("my_sgpa");

    if(pin) {
        if(statsRaw) {
            const stats = JSON.parse(statsRaw);
            const mine = parseFloat(mySgpa) || 0;
            if(window.drawBarGraph) {
                window.drawBarGraph(stats.top, stats.avg, stats.low, mine);
            }
        }
        getDoc(doc(db, "class_results", pin)).then(docSnap => {
            if(docSnap.exists()) {
                const d = docSnap.data();
                if(document.querySelector('.student-details h2'))
                    document.querySelector('.student-details h2').innerText = d.name;
                if(document.querySelector('.student-details p'))
                    document.querySelector('.student-details p').innerText = d.pin + " | " + d.branch;
                const statBoxes = document.querySelectorAll('.stat-box h3');
                if(statBoxes.length > 0) {
                    statBoxes[0].innerText = d.avg_sgpa;
                    statBoxes[1].innerText = d.credits;
                }
            }
        });
    } else {
        window.location.href = "pin.html"; // Redirect to auth if no pin
    }
}

// ===============================================
// 2. AUTHENTICATION LOGIC (UPDATED)
// ===============================================

// --- SIGN UP ---
window.handleSignup = async function(e) {
    e.preventDefault();
    
    const name = document.getElementById('regName').value;
    const email = document.getElementById('regEmail').value;
    const pin = document.getElementById('regPin').value.toUpperCase().trim(); 
    const phone = document.getElementById('regPhone').value;
    const pass = document.getElementById('regPass').value;

    const btn = document.querySelector('#signUpForm button');
    btn.innerText = "Creating Account...";
    btn.disabled = true;

    try {
        const userCredential = await createUserWithEmailAndPassword(auth, email, pass);
        const user = userCredential.user;

        await setDoc(doc(db, "users", pin), {
            uid: user.uid,
            name: name,
            email: email,
            phone: phone,
            pin: pin,
            createdAt: new Date().toISOString()
        });

        alert("Account Created! Please Sign In.");
        window.location.reload();

    } catch (error) {
        console.error(error);
        alert("Error: " + error.message);
        btn.innerText = "Sign Up";
        btn.disabled = false;
    }
};

// --- SIGN IN ---
window.handleLogin = async function(e) {
    e.preventDefault();

    const pin = document.getElementById('loginUser').value.toUpperCase().trim();
    const pass = document.getElementById('loginPass').value;
    const btn = document.querySelector('#signInForm button');
    
    btn.innerText = "Checking...";
    btn.disabled = true;

    try {
        const userDocRef = doc(db, "users", pin);
        const docSnap = await getDoc(userDocRef);

        if (!docSnap.exists()) {
            throw new Error("PIN not registered. Please Sign Up first.");
        }

        const userData = docSnap.data();
        const email = userData.email;

        await signInWithEmailAndPassword(auth, email, pass);

        // Save Session Data
        localStorage.setItem("userPIN", pin);
        localStorage.setItem("userName", userData.name);
        
        // --- FIX: Redirect to PIN Analysis first, not Dashboard ---
        window.location.href = "pin.html"; 

    } catch (error) {
        console.error(error);
        alert("Login Failed: " + error.message);
        btn.innerText = "Sign In";
        btn.disabled = false;
    }
};
// ... (Your existing code above) ...

// --- AUTO-RUN LOGIC ---
// This checks if we are on the Marketplace page and runs the loader automatically
if (document.getElementById('marketContainer')) {
    console.log("Marketplace container found, loading items...");
    window.loadMarketplace();
}
