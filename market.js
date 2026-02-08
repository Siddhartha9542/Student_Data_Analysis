import { initializeApp } from "https://www.gstatic.com/firebasejs/9.6.1/firebase-app.js";
import { getFirestore, collection, addDoc, getDocs, getDoc, doc, deleteDoc, updateDoc, query, where, orderBy, serverTimestamp } from "https://www.gstatic.com/firebasejs/9.6.1/firebase-firestore.js";
import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm';

// --- CONFIGURATION ---
const firebaseConfig = {
  apiKey: "AIzaSyDpN_1iAlE6K7YEeKOt5fMnPqMo5eNodBM",
  authDomain: "student-data-analysis-85831.firebaseapp.com",
  projectId: "student-data-analysis-85831",
  storageBucket: "student-data-analysis-85831.firebasestorage.app",
  messagingSenderId: "739540856409",
  appId: "1:739540856409:web:155e5d3efb17211aff8b48",
  measurementId: "G-Y0VK71KDB1"
};

const supabaseUrl = 'https://zgkjmnoqnbtfcyrifjai.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inpna2ptbm9xbmJ0ZmN5cmlmamFpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njk1MjkyMDQsImV4cCI6MjA4NTEwNTIwNH0.p4M5L5XrNwPfYZ78uiHYqbnMyW80vca1p0Ua-_g88x4';

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const supabase = createClient(supabaseUrl, supabaseKey);

const currentUserPIN = localStorage.getItem("userPIN");
const currentUserName = localStorage.getItem("userName");

// --- UTILS ---
function dataURLtoBlob(dataurl) {
    var arr = dataurl.split(','), mime = arr[0].match(/:(.*?);/)[1],
        bstr = atob(arr[1]), n = bstr.length, u8arr = new Uint8Array(n);
    while(n--){ u8arr[n] = bstr.charCodeAt(n); }
    return new Blob([u8arr], {type:mime});
}

async function compressImage(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = (event) => {
            const img = new Image();
            img.src = event.target.result;
            img.onload = () => {
                const canvas = document.createElement('canvas');
                const MAX_WIDTH = 1000; 
                const scaleSize = MAX_WIDTH / img.width;
                canvas.width = MAX_WIDTH;
                canvas.height = img.height * scaleSize;
                const ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
                resolve(canvas.toDataURL('image/jpeg', 0.7));
            }
            img.onerror = (e) => reject("Image Load Error");
        }
        reader.onerror = (e) => reject("File Read Error");
    });
}

// ==========================================
// 1. PUBLIC MARKETPLACE LOGIC
// ==========================================
window.loadMarketplace = async function() {
    const container = document.getElementById('marketContainer');
    if(!container) return;
    
    container.innerHTML = '<div style="padding:20px;text-align:center;color:#888"><i class="fa-solid fa-circle-notch fa-spin"></i> Loading...</div>';
    
    try {
        const q = query(
            collection(db, "market_items"), 
            where("status", "==", "approved"), 
            orderBy("timestamp", "desc")
        );

        const querySnapshot = await getDocs(q);
        
        container.innerHTML = '';
        if (querySnapshot.empty) {
            container.innerHTML = '<p style="text-align:center; color:#888;">No items found.</p>';
            return;
        }

        querySnapshot.forEach((doc) => {
            const item = doc.data();
            
            // Check Availability Date
            let availBadge = "";
            let isFuture = false;
            
            if (item.available_date) {
                const availDate = new Date(item.available_date);
                const today = new Date();
                today.setHours(0,0,0,0);
                
                if (availDate > today) {
                    isFuture = true;
                    availBadge = `<div class="date-badge">Available on ${availDate.toLocaleDateString()}</div>`;
                }
            }

            const card = document.createElement('div');
            card.className = 'item-card';
            
            // If future date, maybe warn on click or just show badge
            card.onclick = () => window.location.href = `Contact.html?id=${doc.id}`; 
            
            card.innerHTML = `
                <div class="item-img-box">
                    <img src="${item.image_url}" onerror="this.src='https://via.placeholder.com/150?text=No+Image'">
                    <div class="price-tag">₹${item.price}</div>
                    ${availBadge}
                </div>
                <div class="item-info">
                    <div class="item-title">${item.title}</div>
                    <div class="item-loc">@${item.seller_name}</div>
                </div>
            `;
            container.appendChild(card);
        });

    } catch (error) {
        console.error(error);
        container.innerHTML = `<p style="color:red; text-align:center;">Error: ${error.message}</p>`;
    }
}

// ==========================================
// 2. SUBMIT AD LOGIC
// ==========================================
window.submitAd = async function() {
    if (!currentUserPIN) {
        alert("Please login first!");
        window.location.href = "auth.html";
        return;
    }

    const title = document.getElementById('prodName').value;
    const price = document.getElementById('prodPrice').value;
    const category = document.getElementById('selectedCategory').value;
    const desc = document.getElementById('prodDesc').value;
    const type = document.querySelector('.rent-mode') ? 'Rent' : 'Sell';
    const fileInput = document.getElementById('fileInput');

    if(!title || !price || !category || !fileInput.files[0]) {
        alert("Please fill all fields and add an image.");
        return;
    }

    const submitBtn = document.querySelector('.btn-submit');
    submitBtn.innerText = "Processing...";
    submitBtn.disabled = true;

    try {
        const userDocRef = doc(db, "users", currentUserPIN);
        const userSnap = await getDoc(userDocRef);
        
        let sellerPhone = "";
        if (userSnap.exists()) {
            sellerPhone = userSnap.data().phone || "";
        }
        const cleanPhone = sellerPhone.toString().replace(/\D/g, '');
        
        if (!sellerPhone || cleanPhone.length < 10) {
            alert("⚠️ Cannot Post Ad:\nYour profile is missing a valid Phone Number.\nBuyers need this to contact you.");
            submitBtn.innerText = "SUBMIT AD";
            submitBtn.disabled = false;
            return;
        }

        submitBtn.innerText = "Uploading Image...";
        const compressedBase64 = await compressImage(fileInput.files[0]);
        const imageBlob = dataURLtoBlob(compressedBase64);
        const fileName = `${currentUserPIN}_${Date.now()}.jpg`;

        const { data, error } = await supabase.storage
            .from('market-images')
            .upload(fileName, imageBlob, { contentType: 'image/jpeg' });

        if (error) throw new Error("Supabase Upload Failed: " + error.message);

        const { data: publicURLData } = supabase.storage
            .from('market-images')
            .getPublicUrl(fileName);
        
        submitBtn.innerText = "Saving...";
        await addDoc(collection(db, "market_items"), {
            title: title,
            price: Number(price),
            category: category,
            type: type,
            description: desc,
            image_url: publicURLData.publicUrl,
            seller_pin: currentUserPIN,
            seller_name: currentUserName || "Student",
            seller_phone: sellerPhone,
            status: "pending",
            available_date: null,
            timestamp: serverTimestamp()
        });

        document.getElementById('successModal').style.display = 'flex';
        submitBtn.innerText = "SUBMIT AD";
        submitBtn.disabled = false;

    } catch (error) {
        alert("Error: " + error.message);
        submitBtn.innerText = "Try Again";
        submitBtn.disabled = false;
    }
}

// ==========================================
// 3. MY ADS DASHBOARD LOGIC (MyAds.html)
// ==========================================
window.loadMyAds = async function() {
    const list = document.getElementById('myAdsList');
    if(!list || !currentUserPIN) return;

    list.innerHTML = '<div style="padding:20px;text-align:center;color:#888">Loading...</div>';

    try {
        // Query ALL items by this seller (Pending, Approved, Sold)
        const q = query(collection(db, "market_items"), where("seller_pin", "==", currentUserPIN), orderBy("timestamp", "desc"));
        const snap = await getDocs(q);

        if(snap.empty) {
            list.innerHTML = '<div style="padding:40px;text-align:center;color:#666">You haven\'t posted any ads yet.</div>';
            return;
        }

        let html = "";
        snap.forEach(doc => {
            const data = doc.data();
            const isSold = data.status === "sold";
            
            // Format Status Color
            let statusColor = "#ffd700"; // Pending (Gold)
            if(data.status === "approved") statusColor = "#00ff9d";
            if(data.status === "sold") statusColor = "#ff0055";

            html += `
                <div class="ad-card" style="opacity: ${isSold ? 0.6 : 1}">
                    <img src="${data.image_url}" class="ad-thumb">
                    <div class="ad-info">
                        <div class="ad-title">${data.title}</div>
                        <div class="ad-price">₹${data.price}</div>
                        <div class="ad-status" style="color:${statusColor}">${data.status.toUpperCase()}</div>
                        
                        <div class="controls">
                            <button class="btn-control btn-delete" onclick="deleteAd('${doc.id}')">
                                <i class="fa-solid fa-trash"></i>
                            </button>
                            <button class="btn-control btn-sold" onclick="toggleSold('${doc.id}', '${data.status}')">
                                <i class="fa-solid ${isSold ? 'fa-rotate-left' : 'fa-check'}"></i> ${isSold ? 'Relist' : 'Sold'}
                            </button>
                            <button class="btn-control" onclick="openDateModal('${doc.id}')">
                                <i class="fa-regular fa-calendar"></i> Avail
                            </button>
                        </div>
                    </div>
                </div>
            `;
        });
        list.innerHTML = html;

    } catch(e) {
        console.error(e);
        list.innerHTML = "Error loading ads.";
    }
}

window.deleteAd = async function(id) {
    if(!confirm("Are you sure you want to permanently delete this ad?")) return;
    await deleteDoc(doc(db, "market_items", id));
    loadMyAds();
}

window.toggleSold = async function(id, currentStatus) {
    // Toggle: If Sold -> Approved (Relist), If Approved/Pending -> Sold
    const newStatus = currentStatus === "sold" ? "approved" : "sold";
    await updateDoc(doc(db, "market_items", id), { status: newStatus });
    loadMyAds();
}

let currentAdId = null;
window.openDateModal = function(id) {
    currentAdId = id;
    document.getElementById('dateModal').style.display = 'flex';
}

window.closeDateModal = function() {
    document.getElementById('dateModal').style.display = 'none';
}

window.saveAvailability = async function() {
    const dateVal = document.getElementById('availDate').value;
    if(!dateVal) return alert("Select a date");
    
    // Convert to ISO string (YYYY-MM-DD)
    await updateDoc(doc(db, "market_items", currentAdId), { available_date: dateVal });
    closeDateModal();
    alert("Availability Updated!");
    loadMyAds();
}

// ==========================================
// 4. NOTIFICATION SYSTEM LOGIC
// ==========================================
window.checkNotifications = async function() {
    if(!currentUserPIN || !document.getElementById('notifDot')) return;

    try {
        const q = query(
            collection(db, "notifications"), 
            where("recipient_pin", "==", currentUserPIN),
            orderBy("timestamp", "desc")
        );
        
        const snap = await getDocs(q);
        const list = document.getElementById('notifList');
        const dot = document.getElementById('notifDot');
        
        let unreadCount = 0;
        let html = "";

        if(snap.empty) {
            list.innerHTML = '<div style="padding:15px; text-align:center; color:#666;">No notifications</div>';
            return;
        }

        snap.forEach(doc => {
            const data = doc.data();
            if(!data.is_read) unreadCount++;
            
            const icon = data.type === 'success' ? '✅' : '❌';
            
            html += `
                <div class="notif-item ${!data.is_read ? 'unread' : ''}" onclick="markRead('${doc.id}')">
                    <div style="font-weight:600; margin-bottom:4px;">${icon} ${data.type === 'success' ? 'Approved' : 'Rejected'}</div>
                    <div>${data.message}</div>
                </div>
            `;
        });

        list.innerHTML = html;
        if(unreadCount > 0) dot.classList.add('active');
        else dot.classList.remove('active');

    } catch(e) {
        console.error("Notif Error:", e);
    }
}

window.toggleNotifs = function() {
    const list = document.getElementById('notifList');
    list.classList.toggle('show');
}

window.markRead = async function(id) {
    await updateDoc(doc(db, "notifications", id), { is_read: true });
    checkNotifications(); // Refresh UI
}

// --- INIT ---
if(document.getElementById('marketContainer')) {
    loadMarketplace();
    checkNotifications(); // Check alerts on load
}
