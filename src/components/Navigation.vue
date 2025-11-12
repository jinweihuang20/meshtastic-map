<template>
  <nav class="navbar">
    <div class="nav-container">
      <!-- Logo / Brand -->
      <div class="nav-brand">
        <h1>Meshtastic Map</h1>
      </div>

      <!-- Desktop Menu -->
      <ul class="nav-menu desktop-menu">
        <li v-for="item in menuItems" :key="item.name">
          <router-link
            :to="item.path"
            class="nav-item"
            :class="{ active: isActive(item.path) }"
          >
            <span class="nav-icon">{{ item.icon }}</span>
            <span class="nav-label">{{ item.label }}</span>
          </router-link>
        </li>
      </ul>

      <!-- Mobile Hamburger Button -->
      <button class="hamburger" @click="toggleMobileMenu" aria-label="Toggle menu">
        <span class="hamburger-line" :class="{ open: mobileMenuOpen }"></span>
        <span class="hamburger-line" :class="{ open: mobileMenuOpen }"></span>
        <span class="hamburger-line" :class="{ open: mobileMenuOpen }"></span>
      </button>
    </div>

    <!-- Mobile Menu -->
    <div class="mobile-menu-overlay" :class="{ open: mobileMenuOpen }" @click="closeMobileMenu"></div>
    <ul class="nav-menu mobile-menu" :class="{ open: mobileMenuOpen }">
      <li v-for="item in menuItems" :key="item.name">
        <router-link
          :to="item.path"
          class="nav-item"
          :class="{ active: isActive(item.path) }"
          @click="handleMenuClick"
        >
          <span class="nav-icon">{{ item.icon }}</span>
          <span class="nav-label">{{ item.label }}</span>
        </router-link>
      </li>
    </ul>
  </nav>
</template>

<script setup>
import { ref } from 'vue';
import { useRoute } from 'vue-router';

const route = useRoute();
const mobileMenuOpen = ref(false);

const menuItems = [
  { path: '/map', name: 'map', label: 'Map', icon: '🗺️' },
  { path: '/favorites', name: 'favorites', label: '我的最愛', icon: '⭐' }
];

const isActive = (itemPath) => {
  return route.path === itemPath;
};

const handleMenuClick = () => {
  mobileMenuOpen.value = false;
};

const toggleMobileMenu = () => {
  mobileMenuOpen.value = !mobileMenuOpen.value;
};

const closeMobileMenu = () => {
  mobileMenuOpen.value = false;
};
</script>

<style scoped>
.navbar {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  box-shadow: 0 2px 10px rgba(0, 0, 0, 0.1);
  height: var(--navbar-height, 60px);
  z-index: 1000;
}

.nav-container {
  max-width: 1400px;
  margin: 0 auto;
  padding: 0 20px;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.nav-brand h1 {
  margin: 0;
  font-size: 20px;
  font-weight: 600;
  color: white;
  letter-spacing: 0.5px;
}

.nav-menu {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  gap: 10px;
}

.nav-menu li {
  display: flex;
}

.nav-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 20px;
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.3s ease;
  color: rgba(255, 255, 255, 0.9);
  font-size: 14px;
  font-weight: 500;
  user-select: none;
  text-decoration: none;
}

.nav-item:hover {
  background: rgba(255, 255, 255, 0.15);
  color: white;
}

.nav-item.active {
  background: rgba(255, 255, 255, 0.25);
  color: white;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
}

.nav-icon {
  font-size: 18px;
  display: flex;
  align-items: center;
}

.nav-label {
  font-weight: 500;
}

/* Desktop Menu */
.desktop-menu {
  display: none;
}

/* Mobile Hamburger */
.hamburger {
  display: flex;
  flex-direction: column;
  gap: 5px;
  background: none;
  border: none;
  cursor: pointer;
  padding: 5px;
  z-index: 1002;
}

.hamburger-line {
  width: 25px;
  height: 3px;
  background: white;
  border-radius: 3px;
  transition: all 0.3s ease;
}

.hamburger-line:nth-child(1).open {
  transform: rotate(45deg) translate(7px, 7px);
}

.hamburger-line:nth-child(2).open {
  opacity: 0;
}

.hamburger-line:nth-child(3).open {
  transform: rotate(-45deg) translate(7px, -7px);
}

/* Mobile Menu Overlay */
.mobile-menu-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.5);
  opacity: 0;
  visibility: hidden;
  transition: all 0.3s ease;
  z-index: 999;
}

.mobile-menu-overlay.open {
  opacity: 1;
  visibility: visible;
}

/* Mobile Menu */
.mobile-menu {
  position: fixed;
  top: var(--navbar-height, 60px);
  right: 0;
  width: 250px;
  max-width: 80%;
  height: calc(100vh - var(--navbar-height, 60px));
  background: linear-gradient(180deg, #667eea 0%, #764ba2 100%);
  flex-direction: column;
  gap: 0;
  transform: translateX(100%);
  transition: transform 0.3s ease;
  z-index: 1001;
  padding: 20px 0;
  overflow-y: auto;
  box-shadow: -5px 0 15px rgba(0, 0, 0, 0.2);
}

.mobile-menu.open {
  transform: translateX(0);
}

.mobile-menu li {
  width: 100%;
}

.mobile-menu .nav-item {
  padding: 15px 25px;
  border-radius: 0;
  width: 100%;
  justify-content: flex-start;
}

.mobile-menu .nav-item:hover {
  background: rgba(255, 255, 255, 0.1);
}

.mobile-menu .nav-item.active {
  background: rgba(255, 255, 255, 0.2);
  border-left: 4px solid white;
}

/* Desktop Styles (min-width: 768px) */
@media (min-width: 768px) {
  .desktop-menu {
    display: flex;
  }

  .hamburger,
  .mobile-menu,
  .mobile-menu-overlay {
    display: none;
  }

  .nav-brand h1 {
    font-size: 24px;
  }

  .nav-item {
    font-size: 15px;
  }

  .nav-icon {
    font-size: 20px;
  }
}

/* Tablet Styles */
@media (min-width: 768px) and (max-width: 1024px) {
  .nav-container {
    padding: 0 30px;
  }
}

/* Large Desktop Styles */
@media (min-width: 1400px) {
  .nav-brand h1 {
    font-size: 26px;
  }

  .nav-item {
    padding: 12px 24px;
    font-size: 16px;
  }
}
</style>
