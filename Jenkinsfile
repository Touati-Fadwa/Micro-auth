pipeline {
  agent any

  environment {
    IMAGE_NAME = "bibliotheque-auth"
    IMAGE_TAG = "latest"
    REGISTRY = "docker.io"
    KUBE_NAMESPACE = "bibliotheque"
  }

  stages {
    stage('Checkout') {
      steps {
        checkout scm
      }
    }

    stage('Install') {
      steps {
        dir('microservice-auth') {
          sh 'npm ci'
        }
      }
    }

    stage('Build') {
      steps {
        dir('microservice-auth') {
          sh 'npm run build'
        }
      }
    }

    stage('Test') {
      steps {
        dir('microservice-auth') {
          sh 'npm test -- --coverage'
        }
      }
    }

    stage('Docker Build & Push') {
      steps {
        withCredentials([
          usernamePassword(
            credentialsId: '085f1818-1dd9-4505-bec2-cf5c648795a7',
            usernameVariable: 'DOCKER_USER',
            passwordVariable: 'DOCKER_PASS'
          )
        ]) {
          script {
            // Méthode alternative sécurisée pour docker login
            sh '''
              echo "$DOCKER_PASS" | docker login -u "$DOCKER_USER" --password-stdin "$REGISTRY"
              docker build -t "$REGISTRY/$DOCKER_USER/$IMAGE_NAME:$IMAGE_TAG" ./microservice-auth
              docker push "$REGISTRY/$DOCKER_USER/$IMAGE_NAME:$IMAGE_TAG"
            '''
          }
        }
      }
    }

    stage('Deploy to K3s') {
      steps {
        script {
          try {
            withCredentials([file(credentialsId: 'kubeconfig-k3s', variable: 'KUBECONFIG')]) {
              sh '''
                kubectl config set-context --current --namespace="$KUBE_NAMESPACE"
                kubectl apply -f k8s/bibliotheque-auth-deployment.yaml
                kubectl apply -f k8s/bibliotheque-auth-service.yaml
              '''
            }
          } catch (Exception e) {
            error "Deployment failed: ${e.getMessage()}"
          }
        }
      }
    }

    stage('Verify Deployment') {
      steps {
        retry(3) {
          timeout(time: 3, unit: 'MINUTES') {
            withCredentials([file(credentialsId: 'kubeconfig-k3s', variable: 'KUBECONFIG')]) {
              sh '''
                kubectl rollout status deployment/bibliotheque-auth \
                  --namespace="$KUBE_NAMESPACE" \
                  --timeout=180s
              '''
            }
          }
        }
      }
    }
  }

  post {
    failure {
      script {
        echo "Pipeline failed! Attempting rollback..."
        try {
          withCredentials([file(credentialsId: 'kubeconfig-k3s', variable: 'KUBECONFIG')]) {
            sh '''
              kubectl rollout undo deployment/bibliotheque-auth \
                --namespace="$KUBE_NAMESPACE" || true
            '''
          }
        } catch (Exception e) {
          echo "Rollback failed: ${e.getMessage()}"
        }
      }
    }
    always {
      sh 'docker logout "$REGISTRY" || true'
      echo "Pipeline execution completed"
    }
  }
}